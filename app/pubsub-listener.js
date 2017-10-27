import { promisifyAll } from 'bluebird'
import { createClient as createRedisClient } from 'redis'
import { isArray, isPlainObject, keyBy, uniq, uniqBy, cloneDeep, intersection } from 'lodash'
import IoServer from 'socket.io'
import redis_adapter from 'socket.io-redis'
import jwt from 'jsonwebtoken'

import { load as configLoader } from '../config/config'
import { dbAdapter, LikeSerializer, PostSerializer, PubsubCommentSerializer } from './models'


promisifyAll(jwt)

export default class PubsubListener {
  constructor(server, app) {
    this.app = app

    const config = configLoader()

    const redisPub = createRedisClient(config.redis.port, config.redis.host, config.redis.options)
    const redisSub = createRedisClient(config.redis.port, config.redis.host, { ...config.redis.options, detect_buffers: true });

    redisPub.on('error', (err) => {
      app.context.logger.error('redisPub error', err);
    });
    redisSub.on('error', (err) => {
      app.context.logger.error('redisSub error', err);
    });

    this.io = IoServer(server)
    this.io.adapter(redis_adapter({
      pubClient: redisPub,
      subClient: redisSub
    }))

    this.io.sockets.on('error', (err) => {
      app.context.logger.error('socket.io error', err);
    });
    this.io.sockets.on('connection', this.onConnect)

    const redisClient = createRedisClient(config.redis.port, config.redis.host, {})
    redisClient.on('error', (err) => {
      app.context.logger.error('redis error', err);
    });
    redisClient.subscribe(
      'user:update',
      'post:new', 'post:update', 'post:destroy', 'post:hide', 'post:unhide',
      'comment:new', 'comment:update', 'comment:destroy',
      'like:new', 'like:remove', 'comment_like:new', 'comment_like:remove'
    )

    redisClient.on('message', this.onRedisMessage)
  }

  onConnect = async (socket) => {
    const authToken = socket.handshake.query.token
    const config = configLoader()
    const { secret } = config;
    const { logger } = this.app.context;

    try {
      const decoded = await jwt.verifyAsync(authToken, secret)
      socket.user = await dbAdapter.getUserById(decoded.userId)
    } catch (e) {
      socket.user = { id: null }
    }

    socket.on('error', (e) => {
      logger.error('socket.io socket error', e);
    });

    socket.on('auth', async (data) => {
      if (!isPlainObject(data)) {
        logger.warn('socket.io got "auth" request without data');
        return;
      }

      if (data.authToken && typeof data.authToken === 'string') {
        try {
          const decoded = await jwt.verifyAsync(data.authToken, secret);
          socket.user = await dbAdapter.getUserById(decoded.userId);
        } catch (e) {
          socket.user = { id: null };
          logger.warn('socket.io got "auth" request with invalid token, signing user out');
        }
      } else {
        socket.user = { id: null };
      }
    });

    socket.on('subscribe', (data) => {
      if (!isPlainObject(data)) {
        logger.warn('socket.io got "subscribe" request without data');
        return;
      }


      for (const channel of Object.keys(data)) {
        if (!isArray(data[channel])) {
          logger.warn('socket.io got "unsubscribe" request with bogus list of channels');
          continue;
        }

        data[channel].filter(Boolean).forEach(async (id) => {
          if (channel === 'timeline') {
            const t = await dbAdapter.getTimelineById(id);
            if (!t) {
              logger.warn(`attempt to subscribe to nonexistent timeline (ID=${id})`);
              return;
            } else if (t.isPersonal() && t.userId !== socket.user.id) {
              logger.warn(`attempt to subscribe to someone else's '${t.name}' timeline`);
              return;
            }
          }
          socket.join(`${channel}:${id}`)
          logger.info(`User has subscribed to ${id} ${channel}`)
        })
      }
    })

    socket.on('unsubscribe', (data) => {
      if (!isPlainObject(data)) {
        logger.warn('socket.io got "unsubscribe" request without data');
        return;
      }

      for (const channel of Object.keys(data)) {
        if (!isArray(data[channel])) {
          logger.warn('socket.io got "unsubscribe" request with bogus list of channels');
          continue;
        }

        data[channel].filter(Boolean).forEach((id) => {
          socket.leave(`${channel}:${id}`)
          logger.info(`User has unsubscribed from ${id} ${channel}`)
        })
      }
    })
  }

  onRedisMessage = async (channel, msg) => {
    const messageRoutes = {
      'user:update': this.onUserUpdate,

      'post:new':     this.onPostNew,
      'post:update':  this.onPostUpdate,
      'post:destroy': this.onPostDestroy,
      'post:hide':    this.onPostHide,
      'post:unhide':  this.onPostUnhide,

      'comment:new':     this.onCommentNew,
      'comment:update':  this.onCommentUpdate,
      'comment:destroy': this.onCommentDestroy,

      'like:new':            this.onLikeNew,
      'like:remove':         this.onLikeRemove,
      'comment_like:new':    this.onCommentLikeNew,
      'comment_like:remove': this.onCommentLikeRemove,
    };

    try {
      await messageRoutes[channel](this.io.sockets, JSON.parse(msg));
    } catch (e) {
      this.app.context.logger.error('onRedisMessage error', e);
    }
  }

  async broadcastMessage(sockets, rooms, type, json, post, emitter = defaultEmitter) {
    const { logger } = this.app.context;

    let destSockets = rooms
      .filter((r) => r in sockets.adapter.rooms) // active rooms
      .map((r) => Object.keys(sockets.adapter.rooms[r])) // arrays of clientIds
      .reduce((prev, curr) => prev.concat(curr), []) // flatten clientIds
      .filter((v, i, a) => a.indexOf(v) === i) // deduplicate (https://stackoverflow.com/a/14438954)
      .map((id) => sockets.connected[id]);

    let users = destSockets.map((s) => s.user);
    if (post) {
      users = await post.onlyUsersCanSeePost(users);
      destSockets = destSockets.filter((s) => users.includes((s.user)));
    }

    const bansMap = await dbAdapter.getUsersBansIdsMap(users.map((u) => u.id).filter((id) => !!id));

    await Promise.all(destSockets.map(async (socket) => {
      const { user } = socket;
      if (!user) {
        logger.error('user is null in broadcastMessage');
        return;
      }

      // Bans
      if (post && user.id) {
        const banIds = bansMap.get(user.id) || [];
        if (
          ((type === 'comment:new' || type === 'comment:update') && banIds.includes(json.comments.createdBy))
          || ((type === 'like:new') && banIds.includes(json.users.id))
          || ((type === 'comment_like:new' || type === 'comment_like:remove') &&
            (banIds.includes(json.comments.createdBy) || banIds.includes(json.comments.userId)))
        ) {
          return;
        }
      }

      const realtimeChannels = intersection(rooms, socket.rooms);

      await emitter(socket, type, { ...json, realtimeChannels });
    }));
  }

  onUserUpdate = async (sockets, data) => {
    await this.broadcastMessage(sockets, [`user:${data.user.id}`], 'user:update', data, null);
  };

  // Message-handlers follow
  onPostDestroy = async (sockets, data) => {
    const post = await dbAdapter.getPostById(data.postId)
    const json = { meta: { postId: data.postId } }

    sockets.in(`timeline:${data.timelineId}`).emit('post:destroy', json)
    sockets.in(`post:${data.postId}`).emit('post:destroy', json)

    const type = 'post:destroy'
    const rooms = [`timeline:${data.timelineId}`, `post:${data.postId}`];
    await this.broadcastMessage(sockets, rooms, type, json, post);
  }

  onPostNew = async (sockets, data) => {
    const post = await dbAdapter.getPostById(data.postId)
    const json = await new PostSerializer(post).promiseToJSON()

    const type = 'post:new'
    const rooms = await getRoomsOfPost(post)
    await this.broadcastMessage(sockets, rooms, type, json, post, this._postEventEmitter);
  }

  onPostUpdate = async (sockets, data) => {
    const post = await dbAdapter.getPostById(data.postId)
    const json = await new PostSerializer(post).promiseToJSON()

    const type = 'post:update'
    const rooms = await getRoomsOfPost(post)
    await this.broadcastMessage(sockets, rooms, type, json, post, this._postEventEmitter);
  }

  onCommentNew = async (sockets, data) => {
    const comment = await dbAdapter.getCommentById(data.commentId)

    if (!comment) {
      // might be outdated event
      return
    }

    const post = await dbAdapter.getPostById(comment.postId)
    const json = await new PubsubCommentSerializer(comment).promiseToJSON()

    const type = 'comment:new'
    const timelines = await dbAdapter.getTimelinesByIds(data.timelineIds)
    const rooms = await getRoomsOfPost(post, timelines);
    await this.broadcastMessage(sockets, rooms, type, json, post, this._commentLikeEventEmitter);
  }

  onCommentUpdate = async (sockets, data) => {
    const comment = await dbAdapter.getCommentById(data.commentId)
    const post = await dbAdapter.getPostById(comment.postId)
    const json = await new PubsubCommentSerializer(comment).promiseToJSON()

    const type = 'comment:update'
    const rooms = await getRoomsOfPost(post)
    await this.broadcastMessage(sockets, rooms, type, json, post, this._commentLikeEventEmitter);
  }

  onCommentDestroy = async (sockets, data) => {
    const json = { postId: data.postId, commentId: data.commentId }
    const post = await dbAdapter.getPostById(data.postId)

    const type = 'comment:destroy'
    const rooms = await getRoomsOfPost(post)
    await this.broadcastMessage(sockets, rooms, type, json, post);
  }

  onLikeNew = async (sockets, data) => {
    const [
      user,
      post,
    ] = await Promise.all([
      await dbAdapter.getUserById(data.userId),
      await dbAdapter.getPostById(data.postId),
    ]);
    const json = await new LikeSerializer(user).promiseToJSON();
    json.meta = { postId: data.postId }

    const timelines = await dbAdapter.getTimelinesByIds(data.timelineIds)

    const type = 'like:new'
    const rooms = await getRoomsOfPost(post, timelines);
    await this.broadcastMessage(sockets, rooms, type, json, post);
  }

  onLikeRemove = async (sockets, { userId, postId, prevFeedIds }) => {
    const json = { meta: { userId, postId } }
    const [
      post,
      timelines,
    ] = await Promise.all([
      dbAdapter.getPostById(postId),
      dbAdapter.getTimelinesByIds(prevFeedIds),
    ]);

    const type = 'like:remove'
    const rooms = await getRoomsOfPost(post, timelines);
    await this.broadcastMessage(sockets, rooms, type, json, post);
  }

  onPostHide = async (sockets, { postId, userId }) => {
    // NOTE: this event only broadcasts to hider's sockets  
    // so it won't leak any personal information  
    const json = { meta: { postId } };
    const post = await dbAdapter.getPostById(postId)

    const type = 'post:hide';
    const rooms = await getRoomsOfPost(post);
    await this.broadcastMessage(sockets, rooms, type, json, post, this._singleUserEmitter(userId));
  }

  onPostUnhide = async (sockets, { postId, userId }) => {
    // NOTE: this event only broadcasts to hider's sockets  
    // so it won't leak any personal information  
    const json = { meta: { postId } };
    const post = await dbAdapter.getPostById(postId)

    const type = 'post:unhide';
    const rooms = await getRoomsOfPost(post);
    await this.broadcastMessage(sockets, rooms, type, json, post, this._singleUserEmitter(userId));
  }

  onCommentLikeNew = async (sockets, data) => {
    await this._sendCommentLikeMsg(sockets, data, 'comment_like:new');
  };

  onCommentLikeRemove = async (sockets, data) => {
    await this._sendCommentLikeMsg(sockets, data, 'comment_like:remove');
  };

  _sendCommentLikeMsg = async (sockets, data, msgType) => {
    const comment = await dbAdapter.getCommentById(data.commentId);
    const post = await dbAdapter.getPostById(data.postId);

    if (!comment || !post) {
      return;
    }

    const json = await new PubsubCommentSerializer(comment).promiseToJSON();
    if (msgType === 'comment_like:new') {
      json.comments.userId = data.likerUUID;
    } else {
      json.comments.userId = data.unlikerUUID;
    }

    const rooms = await getRoomsOfPost(post);
    await this.broadcastMessage(sockets, rooms, msgType, json, post, this._commentLikeEventEmitter);
  };

  async _commentLikeEventEmitter(socket, type, json) {
    const commentUUID = json.comments.id;
    const viewer = socket.user;
    const [commentLikesData] = await dbAdapter.getLikesInfoForComments([commentUUID], viewer.id);
    json.comments.likes = parseInt(commentLikesData.c_likes);
    json.comments.hasOwnLike = commentLikesData.has_own_like;

    defaultEmitter(socket, type, json);
  }

  _postEventEmitter = async (socket, type, json) => {
    // We should make a copy of json because  
    // there are parallel emitters running with  
    // the same data  
    json = cloneDeep(json);
    const viewer = socket.user;
    json = await this._insertCommentLikesInfo(json, viewer.id);

    if (type !== 'post:new') {
      const isHidden = !!viewer.id && await dbAdapter.isPostHiddenByUser(json.posts.id, viewer.id);
      if (isHidden) {
        json.posts.isHidden = true;
      }
    }
    defaultEmitter(socket, type, json);
  }

  /** 
   * Emits message only to the specified user 
   */ 
  _singleUserEmitter = (userId) => (socket, type, json) => {
    if (socket.user.id === userId) {
      defaultEmitter(socket, type, json);
    }
  };

  async _insertCommentLikesInfo(postPayload, viewerUUID) {
    postPayload.posts = { ...postPayload.posts, commentLikes: 0, ownCommentLikes: 0, omittedCommentLikes: 0, omittedOwnCommentLikes: 0 };

    const commentIds = postPayload.posts.comments;
    if (!commentIds || commentIds.length == 0) {
      return postPayload;
    }

    const [commentLikesData, [commentLikesForPost]] = await Promise.all([
      dbAdapter.getLikesInfoForComments(commentIds, viewerUUID),
      dbAdapter.getLikesInfoForPosts([postPayload.posts.id], viewerUUID)
    ]);

    const commentLikes = keyBy(commentLikesData, 'uid');
    postPayload.comments = postPayload.comments.map((comment) => {
      comment.likes      = 0;
      comment.hasOwnLike = false;

      if (commentLikes[comment.id]) {
        comment.likes      = parseInt(commentLikes[comment.id].c_likes);
        comment.hasOwnLike = commentLikes[comment.id].has_own_like;
      }
      return comment;
    });

    postPayload.posts.commentLikes    = parseInt(commentLikesForPost.post_c_likes_count);
    postPayload.posts.ownCommentLikes = parseInt(commentLikesForPost.own_c_likes_count);

    if (postPayload.posts.commentLikes == 0) {
      return postPayload;
    }

    postPayload.posts.omittedCommentLikes    = postPayload.posts.commentLikes;
    postPayload.posts.omittedOwnCommentLikes = postPayload.posts.ownCommentLikes;

    for (const comment of postPayload.comments) {
      postPayload.posts.omittedCommentLikes     -= comment.likes;
      postPayload.posts.omittedOwnCommentLikes  -= comment.hasOwnLike * 1;
    }

    return postPayload;
  }
}

/**
 * Returns array of room names related to post as union of 
 * post room and timelines: `post.getTimelines()`, post author's  
 * and likers/commenters `MyDiscussions` feeds  
 * and `extraFeeds`. 
 * 
 * @param {Post} post 
 * @param {Timeline[]} extraFeeds 
 * @return {string[]}
 */
async function getRoomsOfPost(post, extraFeeds = []) {
  if (!post) {
    return [];
  }

  const postFeeds = await post.getTimelines();
  const myDiscussionsOwnerIds = [...postFeeds, ...extraFeeds]
    .filter((f) => f.isLikes() || f.isComments())
    .map((f) => f.userId);

  myDiscussionsOwnerIds.push(post.userId);
  const myDiscussionsFeeds = await dbAdapter.getUsersNamedTimelines(uniq(myDiscussionsOwnerIds), 'MyDiscussions');

  const feeds = uniqBy([...postFeeds, ...myDiscussionsFeeds, ...extraFeeds], 'id');

  const rooms = feeds.map((t) => `timeline:${t.id}`);
  rooms.push(`post:${post.id}`);
  return rooms;
}

const defaultEmitter = (socket, type, json) => socket.emit(type, json);

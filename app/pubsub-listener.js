import { promisifyAll } from 'bluebird'
import { createClient as createRedisClient } from 'redis'
import { compact, isArray, isPlainObject, keyBy } from 'lodash'
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

    redisPub.on('error', (err) => { app.context.logger.error('redisPub error', err) })
    redisSub.on('error', (err) => { app.context.logger.error('redisSub error', err) })

    this.io = IoServer(server)
    this.io.adapter(redis_adapter({
      pubClient: redisPub,
      subClient: redisSub
    }))

    this.io.sockets.on('error', (err) => { app.context.logger.error('socket.io error', err) })
    this.io.sockets.on('connection', this.onConnect)

    const redisClient = createRedisClient(config.redis.port, config.redis.host, {})
    redisClient.on('error', (err) => { app.context.logger.error('redis error', err) })
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
    const secret = config.secret
    const logger = this.app.context.logger

    try {
      const decoded = await jwt.verifyAsync(authToken, secret)
      socket.user = await dbAdapter.getUserById(decoded.userId)
    } catch (e) {
      socket.user = { id: null }
    }

    socket.on('error', (e) => {
      logger.error('socket.io socket error', e);
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

        data[channel].filter(Boolean).forEach((id) => {
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
    }

    messageRoutes[channel](
      this.io.sockets,
      JSON.parse(msg)
    ).catch((e) => { this.app.context.logger.error('onRedisMessage error', e)})
  }

  async validateAndEmitMessage(sockets, room, type, json, post, emitter = null) {
    const logger = this.app.context.logger

    if (!(room in sockets.adapter.rooms)) {
      return
    }

    const clientIds = Object.keys(sockets.adapter.rooms[room])

    await Promise.all(clientIds.map(async (clientId) => {
      const socket = sockets.connected[clientId]
      const user = socket.user

      if (!user) {
        logger.error('user is null in validateAndEmitMessage')
        return
      }

      if (post) {
        if (!(await post.canShow(user.id))) {
          return;
        }

        if (user.id) {  // otherwise, it is an anonymous user
          const banIds = await user.getBanIds()

          if (banIds.includes(post.userId)) {
            return;
          }

          const authorBans = await dbAdapter.getUserBansIds(post.userId)

          if (authorBans.includes(user.id)) {
            return;
          }

          if (type === 'comment:new' || type === 'comment:update') {
            const uid = json.comments.createdBy;

            if (banIds.includes(uid)) {
              return;
            }
          }

          if (type === 'like:new') {
            const uid = json.users.id;

            if (banIds.includes(uid)) {
              return;
            }
          }

          if (type === 'comment_like:new' || type === 'comment_like:remove') {
            const commentAuthorUUID = json.comments.createdBy;

            if (banIds.includes(commentAuthorUUID)) {
              return;
            }

            const likerUUID = json.comments.userId;

            if (banIds.includes(likerUUID)) {
              return;
            }
          }
        }
      }

      if (emitter) {
        await emitter(socket, type, json);
      } else {
        socket.emit(type, json);
      }
    }))
  }

  onUserUpdate = async (sockets, data) => {
    sockets.in(`user:${data.user.id}`).emit('user:update', data);
  };

  // Message-handlers follow
  onPostDestroy = async (sockets, data) => {
    const post = await dbAdapter.getPostById(data.postId)
    const json = { meta: { postId: data.postId } }

    sockets.in(`timeline:${data.timelineId}`).emit('post:destroy', json)
    sockets.in(`post:${data.postId}`).emit('post:destroy', json)

    const type = 'post:destroy'
    let room = `timeline:${data.timelineId}`
    await this.validateAndEmitMessage(sockets, room, type, json, post)

    room = `post:${data.postId}`
    await this.validateAndEmitMessage(sockets, room, type, json, post)
  }

  onPostNew = async (sockets, data) => {
    const post = await dbAdapter.getPostById(data.postId)
    const timelines = await post.getTimelines()

    const feedIdsPromises = timelines.map(async (timeline) => {
      const isBanned = await post.isBannedFor(timeline.userId)

      if (!isBanned) {
        return timeline.id
      }

      return null
    })

    let feedIds = await Promise.all(feedIdsPromises)
    feedIds = compact(feedIds)

    const json = await new PostSerializer(post).promiseToJSON()

    const type = 'post:new'
    const promises = feedIds.map((feedId) => {
      const room = `timeline:${feedId}`
      return this.validateAndEmitMessage(sockets, room, type, json, post, this._postEventEmitter);
    })
    await Promise.all(promises)
  }

  onPostUpdate = async (sockets, data) => {
    const post = await dbAdapter.getPostById(data.postId)
    const timelineIds = await post.getTimelineIds()
    const json = await new PostSerializer(post).promiseToJSON()

    const type = 'post:update'
    let room

    const promises = timelineIds.map(async (timelineId) => {
      room = `timeline:${timelineId}`
      return this.validateAndEmitMessage(sockets, room, type, json, post, this._postEventEmitter);
    })
    await Promise.all(promises)

    room = `post:${data.postId}`
    await this.validateAndEmitMessage(sockets, room, type, json, post, this._postEventEmitter);
  }

  onCommentNew = async (sockets, data) => {
    const comment = await dbAdapter.getCommentById(data.commentId)

    if (!comment) {
      // might be outdated event
      return
    }

    const post = await dbAdapter.getPostById(comment.postId)
    const json = await new PubsubCommentSerializer(comment).promiseToJSON()

    const timelines = await dbAdapter.getTimelinesByIds(data.timelineIds)
    const timelinePromises = timelines.map(async (timeline) => {
      if (await post.isHiddenIn(timeline))
        return null

      return timeline.id
    })

    let actualTimelineIds = await Promise.all(timelinePromises)
    actualTimelineIds = compact(actualTimelineIds)

    const type = 'comment:new'
    let room

    const promises = actualTimelineIds.map((timelineId) => {
      room = `timeline:${timelineId}`
      return this.validateAndEmitMessage(sockets, room, type, json, post, this._commentLikeEventEmitter);
    })

    await Promise.all(promises)

    room = `post:${post.id}`
    await this.validateAndEmitMessage(sockets, room, type, json, post, this._commentLikeEventEmitter);
  }

  onCommentUpdate = async (sockets, data) => {
    const comment = await dbAdapter.getCommentById(data.commentId)
    const post = await dbAdapter.getPostById(comment.postId)
    const json = await new PubsubCommentSerializer(comment).promiseToJSON()

    const type = 'comment:update'
    let room = `post:${post.id}`
    await this.validateAndEmitMessage(sockets, room, type, json, post, this._commentLikeEventEmitter);

    const timelineIds = await post.getTimelineIds()
    const promises = timelineIds.map(async (timelineId) => {
      room = `timeline:${timelineId}`
      await this.validateAndEmitMessage(sockets, room, type, json, post, this._commentLikeEventEmitter);
    })
    await Promise.all(promises)
  }

  onCommentDestroy = async (sockets, data) => {
    const json = { postId: data.postId, commentId: data.commentId }
    const post = await dbAdapter.getPostById(data.postId)

    const type = 'comment:destroy'
    let room = `post:${data.postId}`
    await this.validateAndEmitMessage(sockets, room, type, json, post)

    if (post) {
      const timelineIds = await post.getTimelineIds();
      const promises = timelineIds.map(async (timelineId) => {
        room = `timeline:${timelineId}`;
        await this.validateAndEmitMessage(sockets, room, type, json, post)
      });

      await Promise.all(promises);
    }
  }

  onLikeNew = async (sockets, data) => {
    const user = await dbAdapter.getUserById(data.userId)
    const json = await new LikeSerializer(user).promiseToJSON()
    const post = await dbAdapter.getPostById(data.postId)
    json.meta = { postId: data.postId }

    const timelines = await dbAdapter.getTimelinesByIds(data.timelineIds)
    const timelinePromises = timelines.map(async (timeline) => {
      if (await post.isHiddenIn(timeline))
        return null

      return timeline.id
    })

    let actualTimelineIds = await Promise.all(timelinePromises)
    actualTimelineIds = compact(actualTimelineIds)

    const type = 'like:new'
    let room

    const promises = actualTimelineIds.map((timelineId) => {
      room = `timeline:${timelineId}`
      return this.validateAndEmitMessage(sockets, room, type, json, post)
    })

    await Promise.all(promises)

    room = `post:${data.postId}`
    await this.validateAndEmitMessage(sockets, room, type, json, post)
  }

  onLikeRemove = async (sockets, data) => {
    const json = { meta: { userId: data.userId, postId: data.postId } }
    const post = await dbAdapter.getPostById(data.postId)

    const type = 'like:remove'
    let room = `post:${data.postId}`

    await this.validateAndEmitMessage(sockets, room, type, json, post)

    const timelineIds = await post.getTimelineIds()
    const promises = timelineIds.map(async (timelineId) => {
      room = `timeline:${timelineId}`
      await this.validateAndEmitMessage(sockets, room, type, json, post)
    })

    await Promise.all(promises)
  }

  onPostHide = async (sockets, data) => {
    // NOTE: posts are hidden only on RiverOfNews timeline so this
    // event won't leak any personal information
    const json = { meta: { postId: data.postId } }
    sockets.in(`timeline:${data.timelineId}`).emit('post:hide', json)
  }

  onPostUnhide = async (sockets, data) => {
    // NOTE: posts are hidden only on RiverOfNews timeline so this
    // event won't leak any personal information
    const json = { meta: { postId: data.postId } }
    sockets.in(`timeline:${data.timelineId}`).emit('post:unhide', json)
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

    let room;
    const feeds = await post.getTimelines();
    await Promise.all(feeds.map(async (feed) => {
      if (await post.isHiddenIn(feed)) {
        return null;
      }

      room = `timeline:${feed.id}`;
      return this.validateAndEmitMessage(sockets, room, msgType, json, post, this._commentLikeEventEmitter);
    }));

    room = `post:${data.postId}`;
    await this.validateAndEmitMessage(sockets, room, msgType, json, post, this._commentLikeEventEmitter);
  };

  async _commentLikeEventEmitter(socket, type, json) {
    const commentUUID = json.comments.id;
    const viewer = socket.user;
    const [commentLikesData] = await dbAdapter.getLikesInfoForComments([commentUUID], viewer.id);
    json.comments.likes = parseInt(commentLikesData.c_likes);
    json.comments.hasOwnLike = commentLikesData.has_own_like;

    socket.emit(type, json);
  }

  _postEventEmitter = async (socket, type, json) => {
    const viewer = socket.user;
    json = await this._insertCommentLikesInfo(json, viewer.id);
    socket.emit(type, json);
  }

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

/* eslint babel/semi: "error" */
import { promisifyAll } from 'bluebird';
import { createClient as createRedisClient } from 'redis';
import { cloneDeep, flatten, intersection, isArray, isFunction, isPlainObject, keyBy, map, uniq, uniqBy } from 'lodash';
import IoServer from 'socket.io';
import redis_adapter from 'socket.io-redis';
import jwt from 'jsonwebtoken';
import createDebug from 'debug';

import { load as configLoader } from '../config/config';
import { dbAdapter, LikeSerializer, PostSerializer, PubsubCommentSerializer } from './models';


promisifyAll(jwt);

const config = configLoader();
const debug = createDebug('freefeed:PubsubListener');
const noOp = () => {};

export default class PubsubListener {
  app;
  io;

  constructor(server, app) {
    this.app = app;

    this.io = IoServer(server);
    this.io.adapter(redis_adapter({ host: config.redis.host, port: config.redis.port }));

    this.io.on('error', (err) => {
      debug('socket.io error', err);
    });

    // authentication
    this.io.use(async (socket, next) => {
      const authToken = socket.handshake.query.token;
      const { secret } = config;

      try {
        const decoded = await jwt.verifyAsync(authToken, secret);
        socket.user = await dbAdapter.getUserById(decoded.userId);
      } catch (e) {
        socket.user = { id: null };
      }

      return next();
    });

    this.io.on('connection', this.onConnect);

    const redisClient = createRedisClient(config.redis.port, config.redis.host, {});
    redisClient.on('error', (err) => {
      debug('redis error', err);
    });
    redisClient.subscribe(
      'user:update',
      'post:new', 'post:update', 'post:destroy', 'post:hide', 'post:unhide',
      'comment:new', 'comment:update', 'comment:destroy',
      'like:new', 'like:remove', 'comment_like:new', 'comment_like:remove',
      'global:user:update',
    );

    redisClient.on('message', this.onRedisMessage);
  }

  onConnect = (socket) => {
    const { secret } = config;

    socket.on('error', (e) => {
      debug(`[socket.id=${socket.id}] error`, e);
    });

    socket.on('auth', async (data, callback) => {
      debug(`[socket.id=${socket.id}] 'auth' request`);

      if (!isFunction(callback)) {
        callback = noOp;
      }

      try {
        if (!isPlainObject(data)) {
          debug(`[socket.id=${socket.id}] 'auth' request: no data`);
          return;
        }

        if (data.authToken && typeof data.authToken === 'string') {
          try {
            const decoded = await jwt.verifyAsync(data.authToken, secret);
            socket.user = await dbAdapter.getUserById(decoded.userId);
            callback({ success: true });
            debug(`[socket.id=${socket.id}] 'auth' request: successfully authenticated as ${socket.user.username}`);
          } catch (e) {
            socket.user = { id: null };
            callback({ success: false, message: 'invalid token' });
            debug(`[socket.id=${socket.id}] 'auth' request: invalid token, signing user out`, data.authToken);
          }
        } else {
          socket.user = { id: null };
          callback({ success: true });
        }
      } catch (e) {
        callback({ success: false, message: e.message });
        debug(`[socket.id=${socket.id}] 'auth' request: exception ${e}`);
      }
    });

    socket.on('subscribe', async (data, callback) => {
      debug(`[socket.id=${socket.id}] 'subscribe' request`);

      if (!isFunction(callback)) {
        callback = noOp;
      }

      if (!isPlainObject(data)) {
        callback({ success: false, message: 'request without data' });
        debug(`[socket.id=${socket.id}] 'subscribe' request: no data`);
        return;
      }

      const channelListsPromises = map(data, async (channelIds, channelType) => {
        if (!isArray(channelIds)) {
          throw new Error(`List of ${channelType} ids has to be an array`);
        }

        const promises = channelIds.map(async (id) => {
          if (channelType === 'timeline') {
            const t = await dbAdapter.getTimelineById(id);

            if (!t) {
              throw new Error(`attempt to subscribe to nonexistent timeline (ID=${id})`);
            }

            if (t.isPersonal() && t.userId !== socket.user.id) {
              throw new Error(`attempt to subscribe to someone else's '${t.name}' timeline (ID=${id})`);
            }
          } else if (channelType === 'user') {
            if (id !== socket.user.id) {
              throw new Error(`attempt to subscribe to someone else's '${channelType}' channel (ID=${id})`);
            }
          }

          return `${channelType}:${id}`;
        });

        return await Promise.all(promises);
      });

      try {
        const channelLists = await Promise.all(channelListsPromises);
        flatten(channelLists).map((channelId) => {
          socket.join(channelId);
          debug(`[socket.id=${socket.id}] 'subscribe' request: successfully subscribed to ${channelId}`);
        });

        const rooms = buildGroupedListOfSubscriptions(socket);

        callback({ success: true, rooms });
      } catch (e) {
        callback({ success: false, message: e.message });
        debug(`[socket.id=${socket.id}] 'subscribe' request: exception ${e}`);
      }
    });

    socket.on('unsubscribe', (data, callback) => {
      debug(`[socket.id=${socket.id}] 'unsubscribe' request`);

      if (!isFunction(callback)) {
        callback = noOp;
      }

      if (!isPlainObject(data)) {
        callback({ success: false, message: 'request without data' });
        debug(`[socket.id=${socket.id}] 'unsubscribe' request: no data`);
        return;
      }

      for (const channelType of Object.keys(data)) {
        const channelIds = data[channelType];

        if (!isArray(channelIds)) {
          callback({ success: false, message: `List of ${channelType} ids has to be an array` });
          debug(`[socket.id=${socket.id}] 'unsubscribe' request: got bogus channel list`);
          return;
        }

        channelIds.filter(Boolean).forEach((id) => {
          socket.leave(`${channelType}:${id}`);
          debug(`[socket.id=${socket.id}] 'unsubscribe' request: successfully unsubscribed from ${channelType}:${id}`);
        });
      }

      const rooms = buildGroupedListOfSubscriptions(socket);

      callback({ success: true, rooms });
    });
  };

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

      'global:user:update': this.onGlobalUserUpdate,
    };

    try {
      await messageRoutes[channel](this.io.sockets, JSON.parse(msg));
    } catch (e) {
      debug(`onRedisMessage: error while processing ${channel} request`, e);
    }
  };

  async broadcastMessage(sockets, rooms, type, json, post = null, emitter = defaultEmitter) {
    let destSockets = rooms
      .filter((r) => r in sockets.adapter.rooms) // active rooms
      .map((r) => Object.keys(sockets.adapter.rooms[r].sockets)) // arrays of clientIds
      .reduce((prev, curr) => prev.concat(curr), []) // flatten clientIds
      .filter((v, i, a) => a.indexOf(v) === i) // deduplicate (https://stackoverflow.com/a/14438954)
      .map((id) => sockets.connected[id]);

    if (destSockets.length === 0) {
      return;
    }

    let users = destSockets.map((s) => s.user);
    if (post) {
      users = await post.onlyUsersCanSeePost(users);
      destSockets = destSockets.filter((s) => users.includes((s.user)));
    }

    const bansMap = await dbAdapter.getUsersBansIdsMap(users.map((u) => u.id).filter((id) => !!id));

    await Promise.all(destSockets.map(async (socket) => {
      const { user } = socket;

      if (!user) {
        // is it actually possible now?
        debug(`broadcastMessage: socket ${socket.id} doesn't have user associated with it`);
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

      const realtimeChannels = intersection(rooms, Object.values(socket.rooms));

      await emitter(socket, type, { ...json, realtimeChannels });
    }));
  }

  onUserUpdate = async (sockets, data) => {
    await this.broadcastMessage(sockets, [`user:${data.user.id}`], 'user:update', data, null);
  };

  // Message-handlers follow
  onPostDestroy = async (sockets, { postId, rooms }) => {
    const json = { meta: { postId } };
    const type = 'post:destroy';
    await this.broadcastMessage(sockets, rooms, type, json);
  };

  onPostNew = async (sockets, data) => {
    const post = await dbAdapter.getPostById(data.postId);
    const json = await new PostSerializer(post).promiseToJSON();

    const type = 'post:new';
    const rooms = await getRoomsOfPost(post);
    await this.broadcastMessage(sockets, rooms, type, json, post, this._postEventEmitter);
  };

  onPostUpdate = async (sockets, data) => {
    const post = await dbAdapter.getPostById(data.postId);
    const json = await new PostSerializer(post).promiseToJSON();

    const type = 'post:update';
    const rooms = await getRoomsOfPost(post);
    await this.broadcastMessage(sockets, rooms, type, json, post, this._postEventEmitter);
  };

  onCommentNew = async (sockets, { commentId }) => {
    const comment = await dbAdapter.getCommentById(commentId);

    if (!comment) {
      // might be outdated event
      return;
    }

    const post = await dbAdapter.getPostById(comment.postId);
    const json = await new PubsubCommentSerializer(comment).promiseToJSON();

    const type = 'comment:new';
    const rooms = await getRoomsOfPost(post);
    await this.broadcastMessage(sockets, rooms, type, json, post, this._commentLikeEventEmitter);
  };

  onCommentUpdate = async (sockets, data) => {
    const comment = await dbAdapter.getCommentById(data.commentId);
    const post = await dbAdapter.getPostById(comment.postId);
    const json = await new PubsubCommentSerializer(comment).promiseToJSON();

    const type = 'comment:update';
    const rooms = await getRoomsOfPost(post);
    await this.broadcastMessage(sockets, rooms, type, json, post, this._commentLikeEventEmitter);
  };

  onCommentDestroy = async (sockets, data) => {
    const json = { postId: data.postId, commentId: data.commentId };
    const post = await dbAdapter.getPostById(data.postId);

    const type = 'comment:destroy';
    const rooms = await getRoomsOfPost(post);
    await this.broadcastMessage(sockets, rooms, type, json, post);
  };

  onLikeNew = async (sockets, { userId, postId }) => {
    const [
      user,
      post,
    ] = await Promise.all([
      await dbAdapter.getUserById(userId),
      await dbAdapter.getPostById(postId),
    ]);
    const json = await new LikeSerializer(user).promiseToJSON();
    json.meta = { postId };

    const type = 'like:new';
    const rooms = await getRoomsOfPost(post);
    await this.broadcastMessage(sockets, rooms, type, json, post);
  };

  onLikeRemove = async (sockets, { userId, postId, rooms }) => {
    const json = { meta: { userId, postId } };
    const post = await dbAdapter.getPostById(postId);
    const type = 'like:remove';
    await this.broadcastMessage(sockets, rooms, type, json, post);
  };

  onPostHide = async (sockets, { postId, userId }) => {
    // NOTE: this event only broadcasts to hider's sockets
    // so it won't leak any personal information
    const json = { meta: { postId } };
    const post = await dbAdapter.getPostById(postId);

    const type = 'post:hide';
    const rooms = await getRoomsOfPost(post);
    await this.broadcastMessage(sockets, rooms, type, json, post, this._singleUserEmitter(userId));
  };

  onPostUnhide = async (sockets, { postId, userId }) => {
    // NOTE: this event only broadcasts to hider's sockets
    // so it won't leak any personal information
    const json = { meta: { postId } };
    const post = await dbAdapter.getPostById(postId);

    const type = 'post:unhide';
    const rooms = await getRoomsOfPost(post);
    await this.broadcastMessage(sockets, rooms, type, json, post, this._singleUserEmitter(userId));
  };

  onCommentLikeNew = async (sockets, data) => {
    await this._sendCommentLikeMsg(sockets, data, 'comment_like:new');
  };

  onCommentLikeRemove = async (sockets, data) => {
    await this._sendCommentLikeMsg(sockets, data, 'comment_like:remove');
  };

  onGlobalUserUpdate = async (sockets, user) => {
    await this.broadcastMessage(sockets, ['global:users'], 'global:user:update', { user });
  };

  // Helpers

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
  };

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
 * Returns array of all room names related to post as union of
 * post room and all timelines of posts, materialized or dynamic
 * (as RiverOfNews and MyDiscussions).
 *
 * @param {Post} post
 * @return {string[]}
 */
export async function getRoomsOfPost(post) {
  if (!post) {
    return [];
  }

  const postFeeds = await post.getTimelines();
  const activityFeeds = postFeeds.filter((f) => f.isLikes() || f.isComments());
  const destinationFeeds = postFeeds.filter((f) => f.isPosts() || f.isDirects());

  /**
   * 'MyDiscussions' feeds of post author and users who did
   * some activity (likes, comments) on post.
   */
  const myDiscussionsOwnerIds = activityFeeds.map((f) => f.userId);
  myDiscussionsOwnerIds.push(post.userId);
  const myDiscussionsFeeds = await dbAdapter.getUsersNamedTimelines(uniq(myDiscussionsOwnerIds), 'MyDiscussions');

  // All feeds related to post
  let feeds = [];
  if (config.dynamicRiverOfNews) {
    /**
     * 'RiverOfNews' feeds of post author, users subscribed to post destinations feeds ('Posts' and 'Directs')
     * and (if post is propagable) users subscribed to post activity feeds ('Likes' and 'Comments').
     */
    const riverOfNewsSourceIds = [...destinationFeeds, ...(post.isPropagable ? activityFeeds : [])].map((f) => f.id);
    const riverOfNewsOwnerIds = await dbAdapter.getUsersSubscribedToTimelines(riverOfNewsSourceIds);
    const riverOfNewsFeeds = await dbAdapter.getUsersNamedTimelines([...riverOfNewsOwnerIds, post.userId], 'RiverOfNews');
    feeds = uniqBy([...destinationFeeds, ...activityFeeds, ...riverOfNewsFeeds, ...myDiscussionsFeeds], 'id');
  } else {
    feeds = uniqBy([...postFeeds, ...myDiscussionsFeeds], 'id');
  }

  const rooms = feeds.map((t) => `timeline:${t.id}`);
  rooms.push(`post:${post.id}`);
  return rooms;
}

function buildGroupedListOfSubscriptions(socket) {
  return Object.keys(socket.rooms)
    .map((room) => room.split(':'))
    .filter((pieces) => pieces.length === 2)
    .reduce((result, [channelType, channelId]) => {
      if (!(channelType in result)) {
        result[channelType] = [];
      }

      result[channelType].push(channelId);
      return result;
    }, {});
}

const defaultEmitter = (socket, type, json) => socket.emit(type, json);

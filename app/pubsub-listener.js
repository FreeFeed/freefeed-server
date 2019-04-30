/* eslint babel/semi: "error" */
import { promisifyAll } from 'bluebird';
import { createClient as createRedisClient } from 'redis';
import { cloneDeep, flatten, intersection, isArray, isFunction, isPlainObject, keyBy, map, uniqBy, noop, values, last, omit } from 'lodash';
import IoServer from 'socket.io';
import redis_adapter from 'socket.io-redis';
import jwt from 'jsonwebtoken';
import createDebug from 'debug';
import Raven from 'raven';

import { load as configLoader } from '../config/config';

import { dbAdapter, LikeSerializer, PostSerializer, PubsubCommentSerializer } from './models';
import { eventNames } from './support/PubSubAdapter';
import { difference as listDifference, intersection as listIntersection } from './support/open-lists';


promisifyAll(jwt);

const config = configLoader();
const sentryIsEnabled = 'sentryDsn' in config;
const debug = createDebug('freefeed:PubsubListener');

export default class PubsubListener {
  app;
  io;

  constructor(server, app) {
    this.app = app;

    this.io = IoServer(server, { wsEngine: 'uws' });
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
      if (sentryIsEnabled) {
        Raven.captureException(err, { extra: { err: 'PubsubListener Redis subscriber error' } });
      }

      debug('redis error', err);
    });
    redisClient.subscribe(values(eventNames));

    redisClient.on('message', this.onRedisMessage);
  }

  onConnect = (socket) => {
    promisifyAll(socket);
    const { secret } = config;

    socket.on('error', (e) => {
      debug(`[socket.id=${socket.id}] error`, e);
    });

    onSocketEvent(socket, 'auth', async (data, debugPrefix) => {
      if (!isPlainObject(data)) {
        throw new EventHandlingError('request without data');
      }

      if (data.authToken && typeof data.authToken === 'string') {
        try {
          const decoded = await jwt.verifyAsync(data.authToken, secret);
          socket.user = await dbAdapter.getUserById(decoded.userId);
          debug(`${debugPrefix}: successfully authenticated as ${socket.user.username}`);
        } catch (e) {
          socket.user = { id: null };
          throw new Error('invalid token', `invalid token ${data.authToken}, signing user out`);
        }
      } else {
        socket.user = { id: null };
      }
    });

    onSocketEvent(socket, 'subscribe', async (data, debugPrefix) => {
      if (!isPlainObject(data)) {
        throw new EventHandlingError('request without data');
      }

      const channelListsPromises = map(data, async (channelIds, channelType) => {
        if (!isArray(channelIds)) {
          throw new EventHandlingError(`List of ${channelType} ids has to be an array`);
        }

        const promises = channelIds.map(async (id) => {
          if (channelType === 'timeline') {
            const t = await dbAdapter.getTimelineById(id);

            if (!t) {
              throw new EventHandlingError(
                `attempt to subscribe to nonexistent timeline`,
                `User ${socket.user.id} attempted to subscribe to nonexistent timeline (ID=${id})`
              );
            }

            if (t.isPersonal() && t.userId !== socket.user.id) {
              throw new EventHandlingError(
                `attempt to subscribe to someone else's '${t.name}' timeline`,
                `User ${socket.user.id} attempted to subscribe to '${t.name}' timeline (ID=${id}) belonging to user ${t.userId}`
              );
            }
          } else if (channelType === 'user') {
            if (id !== socket.user.id) {
              throw new EventHandlingError(
                `attempt to subscribe to someone else's '${channelType}' channel`,
                `User ${socket.user.id} attempted to subscribe to someone else's '${channelType}' channel (ID=${id})`
              );
            }
          }

          return `${channelType}:${id}`;
        });

        return await Promise.all(promises);
      });

      const channelLists = await Promise.all(channelListsPromises);
      await Promise.all(flatten(channelLists).map(async (channelId) => {
        await socket.joinAsync(channelId);
        debug(`${debugPrefix}: successfully subscribed to ${channelId}`);
      }));

      const rooms = buildGroupedListOfSubscriptions(socket);

      return { rooms };
    });

    onSocketEvent(socket, 'unsubscribe', async (data, debugPrefix) => {
      if (!isPlainObject(data)) {
        throw new EventHandlingError('request without data');
      }

      const roomsToLeave = [];

      for (const channelType of Object.keys(data)) {
        const channelIds = data[channelType];

        if (!isArray(channelIds)) {
          throw new EventHandlingError(`List of ${channelType} ids has to be an array`, `got bogus channel list`);
        }

        roomsToLeave.push(...channelIds.filter(Boolean).map((id) => `${channelType}:${id}`));
      }

      await Promise.all(roomsToLeave.map(async (room) => {
        await socket.leaveAsync(room);
        debug(`${debugPrefix}: successfully unsubscribed from ${room}`);
      }));

      const rooms = buildGroupedListOfSubscriptions(socket);
      return { rooms };
    });
  };

  onRedisMessage = async (channel, msg) => {
    const messageRoutes = {
      [eventNames.USER_UPDATE]: this.onUserUpdate,

      [eventNames.POST_CREATED]:   this.onPostNew,
      [eventNames.POST_UPDATED]:   this.onPostUpdate,
      [eventNames.POST_DESTROYED]: this.onPostDestroy,
      [eventNames.POST_HIDDEN]:    this.onPostHide,
      [eventNames.POST_UNHIDDEN]:  this.onPostUnhide,

      [eventNames.COMMENT_CREATED]:   this.onCommentNew,
      [eventNames.COMMENT_UPDATED]:   this.onCommentUpdate,
      [eventNames.COMMENT_DESTROYED]: this.onCommentDestroy,

      [eventNames.LIKE_ADDED]:           this.onLikeNew,
      [eventNames.LIKE_REMOVED]:         this.onLikeRemove,
      [eventNames.COMMENT_LIKE_ADDED]:   this.onCommentLikeNew,
      [eventNames.COMMENT_LIKE_REMOVED]: this.onCommentLikeRemove,

      [eventNames.GLOBAL_USER_UPDATED]: this.onGlobalUserUpdate,
    };

    try {
      await messageRoutes[channel](JSON.parse(msg));
    } catch (e) {
      if (sentryIsEnabled) {
        Raven.captureException(e, { extra: { err: 'PubsubListener Redis message handler error' } });
      }

      debug(`onRedisMessage: error while processing ${channel} request`, e);
    }
  };

  async broadcastMessage(rooms, type, json, post = null, emitter = defaultEmitter) {
    if (rooms.length === 0) {
      return;
    }

    let destSockets = Object.values(this.io.sockets.connected)
      .filter((socket) => rooms.some((r) => r in socket.rooms));

    if (destSockets.length === 0) {
      return;
    }

    let users = destSockets.map((s) => s.user);

    if (post) {
      if (type === eventNames.POST_UPDATED) {
        let userIds = users.map((u) => u.id);
        const jsonToSend = omit(json, ['newUserIds', 'removedUserIds']);

        if (json.newUserIds && !json.newUserIds.isEmpty()) {
          // Users who listen to post rooms but
          // could not see post before. They should
          // receive a 'post:new' event.

          const newUserIds = listIntersection(json.newUserIds, userIds).items;
          const newUserRooms = flatten(
            destSockets
              .filter((s) => newUserIds.includes((s.user.id)))
              .map((s) => Object.keys(s.rooms))
          );

          await this.broadcastMessage(
            intersection(newUserRooms, rooms),
            eventNames.POST_CREATED,
            jsonToSend,
            post,
            this._postEventEmitter,
          );

          userIds = listDifference(userIds, newUserIds).items;
        }

        if (json.removedUserIds && !json.removedUserIds.isEmpty()) {
          // Users who listen to post rooms but
          // can not see post anymore. They should
          // receive a 'post:destroy' event.

          const removedUserIds = listIntersection(json.removedUserIds, userIds).items;
          const removedUserRooms = flatten(
            destSockets
              .filter((s) => removedUserIds.includes((s.user.id)))
              .map((s) => Object.keys(s.rooms))
          );

          await this.broadcastMessage(
            intersection(removedUserRooms, rooms),
            eventNames.POST_DESTROYED,
            { meta: { postId: post.id } },
          );

          userIds = listDifference(userIds, removedUserIds).items;
        }

        json = jsonToSend;
        users = users.filter((u) => userIds.includes(u.id));
      } else {
        users = await post.onlyUsersCanSeePost(users);
      }

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
          ((type === eventNames.COMMENT_CREATED || type === eventNames.COMMENT_UPDATED) && banIds.includes(json.comments.createdBy))
          || ((type === eventNames.LIKE_ADDED) && banIds.includes(json.users.id))
          || ((type === eventNames.COMMENT_LIKE_ADDED || type === eventNames.COMMENT_LIKE_REMOVED) &&
            (banIds.includes(json.comments.createdBy) || banIds.includes(json.comments.userId)))
        ) {
          return;
        }
      }

      const realtimeChannels = intersection(rooms, Object.values(socket.rooms));

      await emitter(socket, type, { ...json, realtimeChannels });
    }));
  }

  onUserUpdate = async (data) => {
    await this.broadcastMessage([`user:${data.user.id}`], 'user:update', data, null);
  };

  // Message-handlers follow
  onPostDestroy = async ({ postId, rooms }) => {
    const json = { meta: { postId } };
    const type = eventNames.POST_DESTROYED;
    await this.broadcastMessage(rooms, type, json);
  };

  onPostNew = async (data) => {
    const post = await dbAdapter.getPostById(data.postId);
    const json = await new PostSerializer(post).promiseToJSON();

    const type = eventNames.POST_CREATED;
    const rooms = await getRoomsOfPost(post);
    await this.broadcastMessage(rooms, type, json, post, this._postEventEmitter);
  };

  onPostUpdate = async ({ postId, rooms = null, usersBeforeIds = null }) => {
    const post = await dbAdapter.getPostById(postId);
    const postJson = await new PostSerializer(post).promiseToJSON();

    if (!rooms) {
      rooms = await getRoomsOfPost(post);
    }

    if (usersBeforeIds) {
      // It is possible that after the update of the posts
      // destinations it will become invisible or visible for the some users.
      // 'broadcastMessage' will send 'post:destroy' or 'post:new' to such users.
      const currentUserIds = await post.usersCanSeePostIds();
      postJson.newUserIds = listDifference(currentUserIds, usersBeforeIds);
      postJson.removedUserIds = listDifference(usersBeforeIds, currentUserIds);
    }

    await this.broadcastMessage(
      rooms,
      eventNames.POST_UPDATED,
      postJson,
      post,
      this._postEventEmitter,
    );
  };

  onCommentNew = async ({ commentId }) => {
    const comment = await dbAdapter.getCommentById(commentId);

    if (!comment) {
      // might be outdated event
      return;
    }

    const post = await dbAdapter.getPostById(comment.postId);
    const json = await new PubsubCommentSerializer(comment).promiseToJSON();

    const type = eventNames.COMMENT_CREATED;
    const rooms = await getRoomsOfPost(post);
    await this.broadcastMessage(rooms, type, json, post, this._commentLikeEventEmitter);
  };

  onCommentUpdate = async (data) => {
    const comment = await dbAdapter.getCommentById(data.commentId);
    const post = await dbAdapter.getPostById(comment.postId);
    const json = await new PubsubCommentSerializer(comment).promiseToJSON();

    const type = eventNames.COMMENT_UPDATED;
    const rooms = await getRoomsOfPost(post);
    await this.broadcastMessage(rooms, type, json, post, this._commentLikeEventEmitter);
  };

  onCommentDestroy = async ({ postId, commentId, rooms }) => {
    const json = { postId, commentId };
    const post = await dbAdapter.getPostById(postId);
    const type = eventNames.COMMENT_DESTROYED;
    await this.broadcastMessage(rooms, type, json, post);
  };

  onLikeNew = async ({ userId, postId }) => {
    const [
      user,
      post,
    ] = await Promise.all([
      await dbAdapter.getUserById(userId),
      await dbAdapter.getPostById(postId),
    ]);
    const json = await new LikeSerializer(user).promiseToJSON();
    json.meta = { postId };

    const type = eventNames.LIKE_ADDED;
    const rooms = await getRoomsOfPost(post);
    await this.broadcastMessage(rooms, type, json, post);
  };

  onLikeRemove = async ({ userId, postId, rooms }) => {
    const json = { meta: { userId, postId } };
    const post = await dbAdapter.getPostById(postId);
    const type = eventNames.LIKE_REMOVED;
    await this.broadcastMessage(rooms, type, json, post);
  };

  onPostHide = async ({ postId, userId }) => {
    // NOTE: this event only broadcasts to hider's sockets
    // so it won't leak any personal information
    const json = { meta: { postId } };
    const post = await dbAdapter.getPostById(postId);

    const type = eventNames.POST_HIDDEN;
    const rooms = await getRoomsOfPost(post);
    await this.broadcastMessage(rooms, type, json, post, this._singleUserEmitter(userId));
  };

  onPostUnhide = async ({ postId, userId }) => {
    // NOTE: this event only broadcasts to hider's sockets
    // so it won't leak any personal information
    const json = { meta: { postId } };
    const post = await dbAdapter.getPostById(postId);

    const type = eventNames.POST_UNHIDDEN;
    const rooms = await getRoomsOfPost(post);
    await this.broadcastMessage(rooms, type, json, post, this._singleUserEmitter(userId));
  };

  onCommentLikeNew = async (data) => {
    await this._sendCommentLikeMsg(data, eventNames.COMMENT_LIKE_ADDED);
  };

  onCommentLikeRemove = async (data) => {
    await this._sendCommentLikeMsg(data, eventNames.COMMENT_LIKE_REMOVED);
  };

  onGlobalUserUpdate = async (user) => {
    await this.broadcastMessage(['global:users'], eventNames.GLOBAL_USER_UPDATED, { user });
  };

  // Helpers

  _sendCommentLikeMsg = async (data, msgType) => {
    const comment = await dbAdapter.getCommentById(data.commentId);
    const post = await dbAdapter.getPostById(data.postId);

    if (!comment || !post) {
      return;
    }

    const json = await new PubsubCommentSerializer(comment).promiseToJSON();

    if (msgType === eventNames.COMMENT_LIKE_ADDED) {
      json.comments.userId = data.likerUUID;
    } else {
      json.comments.userId = data.unlikerUUID;
    }

    const rooms = await getRoomsOfPost(post);
    await this.broadcastMessage(rooms, msgType, json, post, this._commentLikeEventEmitter);
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

    if (type !== eventNames.POST_CREATED) {
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

  const [
    postFeeds,
    myDiscussionsFeeds,
    riverOfNewsFeeds,
  ] = await Promise.all([
    post.getTimelines(),
    post.getMyDiscussionsTimelines(),
    post.getRiverOfNewsTimelines(),
  ]);

  const materialFeeds = postFeeds.filter((f) => f.isLikes() || f.isComments() || f.isPosts() || f.isDirects());

  // All feeds related to post
  const feeds = uniqBy([...materialFeeds, ...riverOfNewsFeeds, ...myDiscussionsFeeds], 'id');

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

class EventHandlingError extends Error {
  logMessage;

  constructor(message, logMessage = message) {
    super(message);
    this.logMessage = logMessage;
  }
}

/**
 * Adds handler for the incoming socket events of given type that
 * properly handles: callback parameter and it's absence, debug logging
 * on error, Sentry exceptions capture, and acknowledgment messages.
 *
 * @param {object} socket
 * @param {string} event
 * @param {function} handler
 */
const onSocketEvent = (socket, event, handler) => socket.on(event, async (data, ...extra) => {
  const debugPrefix = `[socket.id=${socket.id}] '${event}' request`;
  const callback = isFunction(last(extra)) ? last(extra) : noop;

  try {
    debug(debugPrefix);
    const result = await handler(data, debugPrefix);
    callback({ success: true, ...result });
  } catch (e) {
    if (e instanceof EventHandlingError) {
      debug(`${debugPrefix}: ${e.logMessage}`);
    } else {
      debug(`${debugPrefix}: ${e.message}`);
    }

    if (sentryIsEnabled) {
      Raven.captureException(e, { extra: { err: `PubsubListener ${event} error` } });
    }

    callback({ success: false, message: e.message });
  }
});

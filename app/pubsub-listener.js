/* eslint babel/semi: "error" */
import { promisifyAll } from 'bluebird';
import { createClient as createRedisClient } from 'redis';
import {
  compact,
  flatten,
  intersection,
  isArray,
  isFunction,
  isPlainObject,
  keyBy,
  last,
  map,
  noop,
  uniqBy,
} from 'lodash';
import IoServer from 'socket.io';
import redis_adapter from 'socket.io-redis';
import createDebug from 'debug';
import Raven from 'raven';
import config from 'config';

import { dbAdapter, AppTokenV1 } from './models';
import { eventNames } from './support/PubSubAdapter';
import { List } from './support/open-lists';
import { tokenFromJWT } from './controllers/middlewares/with-auth-token';
import { HOMEFEED_MODE_FRIENDS_ALL_ACTIVITY, HOMEFEED_MODE_CLASSIC, HOMEFEED_MODE_FRIENDS_ONLY } from './models/timeline';
import { serializeSinglePost, serializeLike } from './serializers/v2/post';
import { serializeCommentForRealtime } from './serializers/v2/comment';
import { serializeUsersByIds } from './serializers/v2/user';


const sentryIsEnabled = 'sentryDsn' in config;
const debug = createDebug('freefeed:PubsubListener');

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
      try {
        socket.user = await getAuthUser(socket.handshake.query.token, socket);
        debug(`[socket.id=${socket.id}] auth user`, socket.user.id);
      } catch (e) {
        // Can not properly return error to client so just treat user as anonymous
        socket.user = { id: null };
        debug(`[socket.id=${socket.id}] auth error`, e.message);
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
    redisClient.subscribe(Object.values(eventNames));

    redisClient.on('message', this.onRedisMessage);
  }

  onConnect = (socket) => {
    promisifyAll(socket);

    socket.on('error', (e) => {
      debug(`[socket.id=${socket.id}] error`, e);
    });

    onSocketEvent(socket, 'auth', async (data) => {
      if (!isPlainObject(data)) {
        throw new EventHandlingError('request without data');
      }

      socket.user = await getAuthUser(data.authToken, socket);
      debug(`[socket.id=${socket.id}] auth user`, socket.user.id);
    });

    onSocketEvent(socket, 'subscribe', async (data, debugPrefix) => {
      if (!isPlainObject(data)) {
        throw new EventHandlingError('request without data');
      }

      const channelListsPromises = map(data, async (channelIds, channelType) => {
        if (!isArray(channelIds)) {
          throw new EventHandlingError(`List of ${channelType} ids has to be an array`);
        }

        const promises = channelIds.map(async (channelId) => {
          const [objId] = channelId.split('?', 2); // channelId may have params after '?'

          if (channelType === 'timeline') {
            const t = await dbAdapter.getTimelineById(objId);

            if (!t) {
              throw new EventHandlingError(
                `attempt to subscribe to nonexistent timeline`,
                `User ${socket.user.id} attempted to subscribe to nonexistent timeline (ID=${objId})`
              );
            }

            if (t.isPersonal() && t.userId !== socket.user.id) {
              throw new EventHandlingError(
                `attempt to subscribe to someone else's '${t.name}' timeline`,
                `User ${socket.user.id} attempted to subscribe to '${t.name}' timeline (ID=${objId}) belonging to user ${t.userId}`
              );
            }
          } else if (channelType === 'user') {
            if (objId !== socket.user.id) {
              throw new EventHandlingError(
                `attempt to subscribe to someone else's '${channelType}' channel`,
                `User ${socket.user.id} attempted to subscribe to someone else's '${channelType}' channel (ID=${objId})`
              );
            }
          }

          return `${channelType}:${channelId}`;
        });

        return await Promise.all(promises);
      });

      const channelLists = await Promise.all(channelListsPromises);
      const roomsToSubscribe = flatten(channelLists);
      await socket.joinAsync(roomsToSubscribe);
      debug(`${debugPrefix}: successfully subscribed to ${roomsToSubscribe.join(', ')}`);

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
      [eventNames.POST_SAVED]:     this.onPostSave,
      [eventNames.POST_UNSAVED]:   this.onPostUnsave,

      [eventNames.COMMENT_CREATED]:   this.onCommentNew,
      [eventNames.COMMENT_UPDATED]:   this.onCommentUpdate,
      [eventNames.COMMENT_DESTROYED]: this.onCommentDestroy,

      [eventNames.LIKE_ADDED]:           this.onLikeNew,
      [eventNames.LIKE_REMOVED]:         this.onLikeRemove,
      [eventNames.COMMENT_LIKE_ADDED]:   this.onCommentLikeNew,
      [eventNames.COMMENT_LIKE_REMOVED]: this.onCommentLikeRemove,

      [eventNames.GLOBAL_USER_UPDATED]: this.onGlobalUserUpdate,
      [eventNames.GROUP_TIMES_UPDATED]: this.onGroupTimesUpdate,
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

        if (json.newUserIds && !json.newUserIds.isEmpty()) {
          // Users who listen to post rooms but
          // could not see post before. They should
          // receive a 'post:new' event.

          const newUserIds = List.intersection(json.newUserIds, userIds).items;
          const newUserRooms = flatten(
            destSockets
              .filter((s) => newUserIds.includes((s.user.id)))
              .map((s) => Object.keys(s.rooms))
          );

          await this.broadcastMessage(
            intersection(newUserRooms, rooms),
            eventNames.POST_CREATED,
            json,
            post,
            this._postEventEmitter,
          );

          userIds = List.difference(userIds, newUserIds).items;
        }

        if (json.removedUserIds && !json.removedUserIds.isEmpty()) {
          // Users who listen to post rooms but
          // can not see post anymore. They should
          // receive a 'post:destroy' event.

          const removedUserIds = List.intersection(json.removedUserIds, userIds).items;
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

          userIds = List.difference(userIds, removedUserIds).items;
        }

        users = users.filter((u) => userIds.includes(u.id));
      } else {
        users = await post.onlyUsersCanSeePost(users);
      }

      destSockets = destSockets.filter((s) => users.includes(s.user));
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

  onPostNew = async ({ postId }) => {
    const post = await dbAdapter.getPostById(postId);
    const json = { postId };
    const type = eventNames.POST_CREATED;
    const rooms = await getRoomsOfPost(post);
    await this.broadcastMessage(rooms, type, json, post, this._postEventEmitter);
  };

  onPostUpdate = async ({ postId, rooms = null, usersBeforeIds = null }) => {
    const post = await dbAdapter.getPostById(postId);
    const json = { postId };

    if (!rooms) {
      rooms = await getRoomsOfPost(post);
    }

    if (usersBeforeIds) {
      // It is possible that after the update of the posts
      // destinations it will become invisible or visible for the some users.
      // 'broadcastMessage' will send 'post:destroy' or 'post:new' to such users.
      const currentUserIds = await post.usersCanSeePostIds();
      json.newUserIds = List.difference(currentUserIds, usersBeforeIds);
      json.removedUserIds = List.difference(usersBeforeIds, currentUserIds);
    }

    await this.broadcastMessage(
      rooms,
      eventNames.POST_UPDATED,
      json,
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
    const json = await serializeCommentForRealtime(comment);

    const type = eventNames.COMMENT_CREATED;
    const rooms = await getRoomsOfPost(post);
    await this.broadcastMessage(rooms, type, json, post, this._commentLikeEventEmitter);
  };

  onCommentUpdate = async (data) => {
    const comment = await dbAdapter.getCommentById(data.commentId);
    const post = await dbAdapter.getPostById(comment.postId);
    const json = await serializeCommentForRealtime(comment);

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
    const json = serializeLike(user);
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

  onPostSave = async ({ postId, userId }) => {
    // NOTE: this event only broadcasts to saver's sockets
    // so it won't leak any personal information
    const json = { meta: { postId } };
    const post = await dbAdapter.getPostById(postId);

    const type = eventNames.POST_SAVED;
    const rooms = await getRoomsOfPost(post);
    await this.broadcastMessage(rooms, type, json, post, this._singleUserEmitter(userId));
  };

  onPostUnsave = async ({ postId, userId }) => {
    // NOTE: this event only broadcasts to saver's sockets
    // so it won't leak any personal information
    const json = { meta: { postId } };
    const post = await dbAdapter.getPostById(postId);

    const type = eventNames.POST_UNSAVED;
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

  onGroupTimesUpdate = async ({ groupIds }) => {
    const groups = (await dbAdapter.getFeedOwnersByIds(groupIds))
      .filter((g) => g.isGroup());

    if (groups.length === 0) {
      return;
    }

    groupIds = groups.map((g) => g.id);
    const feedIds = (await dbAdapter.getUsersNamedTimelines(groupIds, 'Posts'))
      .map((f) => f.id);

    const rooms = (await dbAdapter.getUsersSubscribedToTimelines(feedIds))
      .map((id) => `user:${id}`);
    const updatedGroups = await serializeUsersByIds(groupIds, false);

    await this.broadcastMessage(
      rooms,
      'user:update',
      { updatedGroups },
      null,
      this._withUserIdEmitter,
    );
  };

  // Helpers

  _sendCommentLikeMsg = async (data, msgType) => {
    const comment = await dbAdapter.getCommentById(data.commentId);
    const post = await dbAdapter.getPostById(data.postId);

    if (!comment || !post) {
      return;
    }

    const json = await serializeCommentForRealtime(comment);

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

  _postEventEmitter = async (socket, type, { postId }) => {
    const json = await serializeSinglePost(postId, socket.user.id);
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

  _withUserIdEmitter = (socket, type, json) =>
    socket.user.id && defaultEmitter(socket, type, { ...json, id: socket.user.id });

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

  const author = await dbAdapter.getUserById(post.userId);

  if (!author.isActive) {
    return [];
  }

  const [
    postFeeds,
    myDiscussionsFeeds,
    riverOfNewsFeedsByModes,
  ] = await Promise.all([
    post.getTimelines(),
    post.getMyDiscussionsTimelines(),
    post.getRiverOfNewsTimelinesByModes(),
  ]);

  const materialFeeds = postFeeds.filter((f) => f.isMaterial());

  // All feeds related to post
  const allFeeds = uniqBy([
    ...materialFeeds,
    ...riverOfNewsFeedsByModes[HOMEFEED_MODE_FRIENDS_ALL_ACTIVITY],
    ...myDiscussionsFeeds
  ], 'id');

  const rooms = compact(flatten(allFeeds.map((t) => {
    if (t.isRiverOfNews()) {
      const inNarrowMode = riverOfNewsFeedsByModes[HOMEFEED_MODE_FRIENDS_ONLY].some((f) => f.id === t.id);
      const inClassicMode = riverOfNewsFeedsByModes[HOMEFEED_MODE_CLASSIC].some((f) => f.id === t.id);
      return t.isInherent ? [
        `timeline:${t.id}?homefeed-mode=${HOMEFEED_MODE_FRIENDS_ALL_ACTIVITY}`,
        inClassicMode && `timeline:${t.id}`, // Default mode for inherent feed
        inClassicMode && `timeline:${t.id}?homefeed-mode=${HOMEFEED_MODE_CLASSIC}`,
        inNarrowMode && `timeline:${t.id}?homefeed-mode=${HOMEFEED_MODE_FRIENDS_ONLY}`,
      ] : [
        inNarrowMode && `timeline:${t.id}`, // The only available mode for auxiliary feed
      ];
    }

    return `timeline:${t.id}`;
  })));
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

async function getAuthUser(jwtToken, socket) {
  if (!jwtToken) {
    return { id: null };
  }

  const authData = await tokenFromJWT(
    jwtToken,
    {
      headers:  socket.handshake.headers,
      remoteIP: socket.handshake.address,
      route:    `WS *`,
    },
  );

  if (authData.authToken instanceof AppTokenV1) {
    await authData.authToken.registerUsage({
      ip:        socket.handshake.address,
      userAgent: socket.handshake.headers['user-agent'],
    });
  }

  return authData.user;
}

import { promisifyAll } from 'bluebird'
import { createClient as createRedisClient } from 'redis'
import { compact, isArray, isPlainObject } from 'lodash'
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
      'like:new', 'like:remove'
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

      'like:new':    this.onLikeNew,
      'like:remove': this.onLikeRemove
    }

    messageRoutes[channel](
      this.io.sockets,
      JSON.parse(msg)
    ).catch((e) => { this.app.context.logger.error('onRedisMessage error', e)})
  }

  async validateAndEmitMessage(sockets, room, type, json, post) {
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
        }
      }

      socket.emit(type, json)
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
      return this.validateAndEmitMessage(sockets, room, type, json, post)
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
      return this.validateAndEmitMessage(sockets, room, type, json, post)
    })
    await Promise.all(promises)

    room = `post:${data.postId}`
    await this.validateAndEmitMessage(sockets, room, type, json, post)
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
      return this.validateAndEmitMessage(sockets, room, type, json, post)
    })

    await Promise.all(promises)

    room = `post:${post.id}`
    await this.validateAndEmitMessage(sockets, room, type, json, post)
  }

  onCommentUpdate = async (sockets, data) => {
    const comment = await dbAdapter.getCommentById(data.commentId)
    const post = await dbAdapter.getPostById(comment.postId)
    const json = await new PubsubCommentSerializer(comment).promiseToJSON()

    const type = 'comment:update'
    let room = `post:${post.id}`
    await this.validateAndEmitMessage(sockets, room, type, json, post)

    const timelineIds = await post.getTimelineIds()
    const promises = timelineIds.map(async (timelineId) => {
      room = `timeline:${timelineId}`
      await this.validateAndEmitMessage(sockets, room, type, json, post)
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
}

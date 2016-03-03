import { promisifyAll } from 'bluebird'
import { createClient as createRedisClient } from 'redis'
import _ from 'lodash'
import IoServer from 'socket.io'
import redis_adapter from 'socket.io-redis'
import jwt from 'jsonwebtoken'

import { dbAdapter, LikeSerializer, PostSerializer, PubsubCommentSerializer } from './models'
import { load as configLoader } from '../config/config'


promisifyAll(jwt)

export default class PubsubListener {
  constructor(server, app) {
    this.app = app

    const config = configLoader()

    var redisPub = createRedisClient(config.redis.port, config.redis.host, config.redis.options)
      , redisSub = createRedisClient(config.redis.port, config.redis.host, _.extend(config.redis.options, { detect_buffers: true }))

    redisPub.on('error', function(err) { app.logger.error('redisPub error', err) })
    redisSub.on('error', function(err) { app.logger.error('redisSub error', err) })

    this.io = IoServer(server)
    this.io.adapter(redis_adapter({
      pubClient: redisPub,
      subClient: redisSub
    }))

    this.io.sockets.on('error', function(err) { app.logger.error('socket.io error', err) })
    this.io.sockets.on('connection', this.onConnect)

    var redisClient = createRedisClient(config.redis.port, config.redis.host, {})
    redisClient.on('error', function(err) { app.logger.error('redis error', err) })
    redisClient.subscribe('post:new', 'post:destroy', 'post:update',
      'comment:new', 'comment:destroy', 'comment:update',
      'like:new', 'like:remove', 'post:hide', 'post:unhide')

    redisClient.on('message', this.onRedisMessage)
  }

  onConnect = async (socket) => {
    let authToken = socket.handshake.query.token
    const config = configLoader()
    let secret = config.secret
    let logger = this.app.logger

    try {
      let decoded = await jwt.verifyAsync(authToken, secret)
      socket.user = await dbAdapter.getUserById(decoded.userId)
    } catch(e) {
      socket.user = { id: null }
    }

    socket.on('subscribe', function(data) {
      for (let channel of Object.keys(data)) {
        if (data[channel]) {
          data[channel].forEach(function(id) {
            if (id) {
              logger.info('User has subscribed to ' + id + ' ' + channel)

              socket.join(channel + ':' + id)
            }
          })
        }
      }
    })

    socket.on('unsubscribe', function(data) {
      for (let channel of Object.keys(data)) {
        if (data[channel]) {
          data[channel].forEach(function(id) {
            if (id) {
              logger.info('User has unsubscribed from ' + id + ' ' + channel)

              socket.leave(channel + ':' + id)
            }
          })
        }
      }
    })
  }

  onRedisMessage = async (channel, msg) => {
    const messageRoutes = {
      'post:new':         this.onPostNew,
      'post:update':      this.onPostUpdate,
      'post:destroy':     this.onPostDestroy,
      'post:hide':        this.onPostHide,
      'post:unhide':      this.onPostUnhide,

      'comment:new':      this.onCommentNew,
      'comment:update':   this.onCommentUpdate,
      'comment:destroy':  this.onCommentDestroy,

      'like:new':         this.onLikeNew,
      'like:remove':      this.onLikeRemove
    }

    messageRoutes[channel](
      this.io.sockets,
      JSON.parse(msg)
    ).catch(e => { this.app.logger.error('onRedisMessage error', e )})
  }

  async validateAndEmitMessage(sockets, room, type, json, post) {
    if (!(room in sockets.adapter.rooms)) {
      return
    }

    let clientIds = Object.keys(sockets.adapter.rooms[room])

    await Promise.all(clientIds.map(async (clientId) => {
      let socket = sockets.connected[clientId]
      let user = socket.user
      let logger = this.app.logger

      if (!post) {
        logger.error('post is null in validateAndEmitMessage')
        return
      }
      if (!user) {
        logger.error('user is null in validateAndEmitMessage')
        return
      }

      let valid = await post.canShow(user.id)

      if (valid)
        socket.emit(type, json)
    }))
  }

  // Message-handlers follow
  onPostDestroy = async (sockets, data) => {
    let post = await dbAdapter.getPostById(data.postId)
    let json = { meta: { postId: data.postId } }

    sockets.in('timeline:' + data.timelineId).emit('post:destroy', json)
    sockets.in('post:' + data.postId).emit('post:destroy', json)

    let type = 'post:destroy'
    let room = `timeline:${data.timelineId}`
    await this.validateAndEmitMessage(sockets, room, type, json, post)

    room = `post:${data.postId}`
    await this.validateAndEmitMessage(sockets, room, type, json, post)
  }

  onPostNew = async (sockets, data) => {
    let post = await dbAdapter.getPostById(data.postId)
    let json = await new PostSerializer(post).promiseToJSON()

    let type = 'post:new'
    let room = `timeline:${data.timelineId}`

    await this.validateAndEmitMessage(sockets, room, type, json, post)
  }

  onPostUpdate = async (sockets, data) => {
    let post = await dbAdapter.getPostById(data.postId)
    let json = await new PostSerializer(post).promiseToJSON()

    let type = 'post:update'
    let room

    if (data.timelineId) {
      room = `timeline:${data.timelineId}`
    } else {
      room = `post:${data.postId}`
    }
    await this.validateAndEmitMessage(sockets, room, type, json, post)
  }

  onCommentNew = async (sockets, data) => {
    let comment = await dbAdapter.getCommentById(data.commentId)

    if (!comment) {
      // might be outdated event
      return
    }

    let post = await dbAdapter.getPostById(comment.postId)
    let json = await new PubsubCommentSerializer(comment).promiseToJSON()

    let type = 'comment:new'
    let room

    if (data.timelineId) {
      room = `timeline:${data.timelineId}`
    } else {
      room = `post:${data.postId}`
    }

    await this.validateAndEmitMessage(sockets, room, type, json, post)
  }

  onCommentUpdate = async (sockets, data) => {
    let comment = await dbAdapter.getCommentById(data.commentId)
    let post = await dbAdapter.getPostById(comment.postId)
    let json = await new PubsubCommentSerializer(comment).promiseToJSON()

    let type = 'comment:update'
    let room

    if (data.timelineId) {
      room = `timeline:${data.timelineId}`
    } else {
      room = `post:${data.postId}`
    }

    await this.validateAndEmitMessage(sockets, room, type, json, post)
  }

  onCommentDestroy = async (sockets, data) => {
    let json = { postId: data.postId, commentId: data.commentId }
    let post = await dbAdapter.getPostById(data.postId)
    
    let type = 'comment:destroy'
    let room
    if (data.timelineId) {
      room = `timeline:${data.timelineId}`
    } else {
      room = `post:${data.postId}`
    }
    await this.validateAndEmitMessage(sockets, room, type, json, post)
  }

  onLikeNew = async (sockets, data) => {
    let user = await dbAdapter.getUserById(data.userId)
    let json = await new LikeSerializer(user).promiseToJSON()
    let post = await dbAdapter.getPostById(data.postId)
    json.meta = { postId: data.postId }

    let type = 'like:new'
    let room
    if (data.timelineId) {
      room = `timeline:${data.timelineId}`
    } else {
      room = `post:${data.postId}`
    }

    await this.validateAndEmitMessage(sockets, room, type, json, post)
  }

  onLikeRemove = async (sockets, data) => {
    let json = { meta: { userId: data.userId, postId: data.postId } }
    let post = await dbAdapter.getPostById(data.postId)

    let type = 'like:remove'
    let room

    if (data.timelineId) {
      room = `timeline:${data.timelineId}`
    } else {
      room = `post:${data.postId}`
    }

    await this.validateAndEmitMessage(sockets, room, type, json, post)
  }

  onPostHide = async (sockets, data) => {
    // NOTE: posts are hidden only on RiverOfNews timeline so this
    // event won't leak any personal information
    let json = { meta: { postId: data.postId } }
    sockets.in('timeline:' + data.timelineId).emit('post:hide', json)
  }

  onPostUnhide = async (sockets, data) => {
    // NOTE: posts are hidden only on RiverOfNews timeline so this
    // event won't leak any personal information
    let json = { meta: { postId: data.postId } }
    sockets.in('timeline:' + data.timelineId).emit('post:unhide', json)
  }
}

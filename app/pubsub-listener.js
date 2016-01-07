import { promisifyAll } from 'bluebird'
import { createClient as createRedisClient } from 'redis'
import _ from 'lodash'
import IoServer from 'socket.io'
import redis_adapter from 'socket.io-redis'
import jwt from 'jsonwebtoken'

import { Comment, LikeSerializer, Post, PostSerializer, PubsubCommentSerializer, User } from './models'
import { load as configLoader } from '../config/config'


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
    this.io.sockets.on('connection', this.onConnect.bind(this))

    var redisClient = createRedisClient(config.redis.port, config.redis.host, {})
    redisClient.on('error', function(err) { app.logger.error('redis error', err) })
    redisClient.subscribe('post:new', 'post:destroy', 'post:update',
      'comment:new', 'comment:destroy', 'comment:update',
      'like:new', 'like:remove', 'post:hide', 'post:unhide')

    redisClient.on('message', this.onRedisMessage.bind(this))
  }

  async onConnect(socket) {
    let authToken = socket.handshake.query.token
    const config = configLoader()
    let secret = config.secret
    let logger = this.app.logger

    let jwtAsync = promisifyAll(jwt)
    try {
      let decoded = await jwtAsync.verifyAsync(authToken, secret)
      socket.user = await User.findById(decoded.userId)
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

  onRedisMessage(channel, msg) {
    const messageRoutes = {
      'post:new':         this.onPostNew.bind(this),
      'post:update':      this.onPostUpdate.bind(this),
      'post:destroy':     this.onPostDestroy.bind(this),
      'post:hide':        this.onPostHide.bind(this),
      'post:unhide':      this.onPostUnhide.bind(this),

      'comment:new':      this.onCommentNew.bind(this),
      'comment:update':   this.onCommentUpdate.bind(this),
      'comment:destroy':  this.onCommentDestroy.bind(this),

      'like:new':         this.onLikeNew.bind(this),
      'like:remove':      this.onLikeRemove.bind(this)
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

      let valid = await post.validateCanShow(user.id)

      if (valid)
        socket.emit(type, json)
    }))
  }

  // Message-handlers follow
  async onPostDestroy(sockets, data) {
    let post = await Post.findById(data.postId)
    let json = { meta: { postId: data.postId } }

    sockets.in('timeline:' + data.timelineId).emit('post:destroy', json)
    sockets.in('post:' + data.postId).emit('post:destroy', json)

    let type = 'post:destroy'
    let room = `timeline:${data.timelineId}`
    await this.validateAndEmitMessage(sockets, room, type, json, post)

    room = `post:${data.postId}`
    await this.validateAndEmitMessage(sockets, room, type, json, post)
  }

  async onPostNew(sockets, data) {
    let post = await Post.findById(data.postId)
    let json = await new PostSerializer(post).promiseToJSON()

    let type = 'post:new'
    let room = `timeline:${data.timelineId}`

    await this.validateAndEmitMessage(sockets, room, type, json, post)
  }

  async onPostUpdate(sockets, data) {
    let post = await Post.findById(data.postId)
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

  async onCommentNew(sockets, data) {
    let comment = await Comment.findById(data.commentId)

    if (!comment) {
      // might be outdated event
      return
    }

    let post = await Post.findById(comment.postId)
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

  async onCommentUpdate(sockets, data) {
    let comment = await Comment.findById(data.commentId)
    let post = await Post.findById(comment.postId)
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

  async onCommentDestroy(sockets, data) {
    let json = { postId: data.postId, commentId: data.commentId }
    let post = await Post.findById(data.postId)
    
    let type = 'comment:destroy'
    let room
    if (data.timelineId) {
      room = `timeline:${data.timelineId}`
    } else {
      room = `post:${data.postId}`
    }
    await this.validateAndEmitMessage(sockets, room, type, json, post)
  }

  async onLikeNew(sockets, data) {
    let user = await User.findById(data.userId)
    let json = await new LikeSerializer(user).promiseToJSON()
    let post = await Post.findById(data.postId)
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

  async onLikeRemove(sockets, data) {
    let json = { meta: { userId: data.userId, postId: data.postId } }
    let post = await Post.findById(data.postId)

    let type = 'like:remove'
    let room

    if (data.timelineId) {
      room = `timeline:${data.timelineId}`
    } else {
      room = `post:${data.postId}`
    }

    await this.validateAndEmitMessage(sockets, room, type, json, post)
  }

  async onPostHide(sockets, data) {
    // NOTE: posts are hidden only on RiverOfNews timeline so this
    // event won't leak any personal information
    let json = { meta: { postId: data.postId } }
    sockets.in('timeline:' + data.timelineId).emit('post:hide', json)
  }

  async onPostUnhide(sockets, data) {
    // NOTE: posts are hidden only on RiverOfNews timeline so this
    // event won't leak any personal information
    let json = { meta: { postId: data.postId } }
    sockets.in('timeline:' + data.timelineId).emit('post:unhide', json)
  }
}

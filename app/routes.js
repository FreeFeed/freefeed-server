import { promisifyAll } from 'bluebird'
import jwt from 'jsonwebtoken'
import express from 'express'

import { load as configLoader } from '../config/config'
import { dbAdapter } from './models'

import SessionRoute from './routes/api/v1/SessionRoute'
import BookmarkletRoute from './routes/api/v1/BookmarkletRoute'
import UsersRoute from './routes/api/v1/UsersRoute'
import TimelinesRoute from './routes/api/v1/TimelinesRoute'
import PostsRoute from './routes/api/v1/PostsRoute'
import AttachmentsRoute from './routes/api/v1/AttachmentsRoute'
import CommentsRoute from './routes/api/v1/CommentsRoute'
import GroupsRoute from './routes/api/v1/GroupsRoute'
import PasswordsRoute from './routes/api/v1/PasswordsRoute'

import GroupsRouteV2 from './routes/api/v2/GroupsRoute'
import RequestsRouteV2 from './routes/api/v2/RequestsRoute'
import UsersRouteV2 from './routes/api/v2/UsersRoute'

const config = configLoader()
promisifyAll(jwt)

export default function(app) {
  const findUser = async (req, res, next) => {
    var authToken = req.headers['x-authentication-token']
      || req.body.authToken
      || req.query.authToken

    if (authToken) {
      try {
        let decoded = await jwt.verifyAsync(authToken, config.secret)
        let user = await dbAdapter.getUserById(decoded.userId)

        if (user) {
          req.user = user
        }
      } catch(e) {
        app.logger.info(`invalid token. the user will be treated as anonymous: ${e.message}`)
      }
    }

    next()
  }

  app.use(express.static(__dirname + '/../public'))

  // unauthenticated routes
  app.options('/*', (req, res) => {
    res.status(200).send({})
  })
  SessionRoute(app)
  PasswordsRoute(app)

  // [at least optionally] authenticated routes
  app.all('/*', findUser)
  BookmarkletRoute(app)
  UsersRoute(app)
  GroupsRoute(app)
  TimelinesRoute(app)
  PostsRoute(app)
  AttachmentsRoute(app)
  CommentsRoute(app)

  GroupsRouteV2(app)
  RequestsRouteV2(app)
  UsersRouteV2(app)
}

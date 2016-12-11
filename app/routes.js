import { promisifyAll } from 'bluebird'
import jwt from 'jsonwebtoken'
import express from 'express'

import { load as configLoader } from '../config/config'
import { dbAdapter } from './models'

import AttachmentsRoute from './routes/api/v1/AttachmentsRoute'
import BookmarkletRoute from './routes/api/v1/BookmarkletRoute'
import CommentsRoute from './routes/api/v1/CommentsRoute'
import GroupsRoute from './routes/api/v1/GroupsRoute'
import PasswordsRoute from './routes/api/v1/PasswordsRoute'
import PostsRoute from './routes/api/v1/PostsRoute'
import SessionRoute from './routes/api/v1/SessionRoute'
import TimelinesRoute from './routes/api/v1/TimelinesRoute'
import UsersRoute from './routes/api/v1/UsersRoute'

import GroupsRouteV2 from './routes/api/v2/GroupsRoute'
import RequestsRouteV2 from './routes/api/v2/RequestsRoute'
import SearchRoute from './routes/api/v2/SearchRoute'
import SummaryRoute from './routes/api/v2/SummaryRoute'
import TimelinesRouteV2 from './routes/api/v2/TimelinesRoute'
import UsersRouteV2 from './routes/api/v2/UsersRoute'
import StatsRouteV2 from './routes/api/v2/Stats'

const config = configLoader();
promisifyAll(jwt);

export default function (app) {
  const findUser = async (req, res, next) => {
    const authToken = req.headers['x-authentication-token']
      || req.body.authToken
      || req.query.authToken;

    if (authToken) {
      try {
        const decoded = await jwt.verifyAsync(authToken, config.secret);
        const user = await dbAdapter.getUserById(decoded.userId);

        if (user) {
          req.user = user;
        }
      } catch (e) {
        app.logger.info(`invalid token. the user will be treated as anonymous: ${e.message}`);
      }
    }

    next();
  };

  app.use(express.static(`${__dirname}/../${config.attachments.storage.rootDir}`));

  // unauthenticated routes
  app.options('/*', (req, res) => {
    res.status(200).send({})
  });
  PasswordsRoute(app);
  SessionRoute(app);

  // [at least optionally] authenticated routes
  app.all('/*', findUser);
  AttachmentsRoute(app);
  BookmarkletRoute(app);
  CommentsRoute(app);
  GroupsRoute(app);
  PostsRoute(app);
  TimelinesRoute(app);
  UsersRoute(app);
  StatsRouteV2(app);

  GroupsRouteV2(app);
  RequestsRouteV2(app);
  SearchRoute(app);
  SummaryRoute(app);
  TimelinesRouteV2(app);
  UsersRouteV2(app);

  app.all('/v[0-9]+/*', (req, res) => res.status(404).send({ err: `API method not found: '${req.path}'` }));
}

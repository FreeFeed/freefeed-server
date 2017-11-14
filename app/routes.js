import { promisifyAll } from 'bluebird'
import jwt from 'jsonwebtoken'
import koaStatic from 'koa-static';
import Router from 'koa-router';
import Raven from 'raven';

import { load as configLoader } from '../config/config';
import { dbAdapter } from './models'
import { reportError } from './support/exceptions'

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
import ArchivesStatsRouteV2 from './routes/api/v2/ArchivesStats'
import PostsRouteV2 from './routes/api/v2/PostsRoute'
import ArchivesRoute from './routes/api/v2/ArchivesRoute'
import NotificationsRoute from './routes/api/v2/NotificationsRoute'
import CommentLikesRoute from './routes/api/v2/CommentLikesRoute'

promisifyAll(jwt);

const config = configLoader();
const sentryIsEnabled = 'sentryDsn' in config;

export default function (app) {
  const findUser = async (ctx, next) => {
    const authToken = ctx.request.get('x-authentication-token')
      || ctx.request.body.authToken
      || ctx.request.query.authToken;

    if (authToken) {
      try {
        const decoded = await jwt.verifyAsync(authToken, config.secret);
        const user = await dbAdapter.getUserById(decoded.userId);

        if (user) {
          ctx.state.user = user;
        }
      } catch (e) {
        ctx.logger.info(`invalid token. the user will be treated as anonymous: ${e.message}`);
      }
    }

    await next();
  };

  const router = new Router();

  // unauthenticated routes
  PasswordsRoute(router);
  SessionRoute(router);

  // [at least optionally] authenticated routes
  router.use(findUser);
  AttachmentsRoute(router);
  BookmarkletRoute(router);
  CommentsRoute(router);
  GroupsRoute(router);
  PostsRoute(router);
  TimelinesRoute(router);
  UsersRoute(router);
  StatsRouteV2(router);

  GroupsRouteV2(router);
  RequestsRouteV2(router);
  SearchRoute(router);
  SummaryRoute(router);
  TimelinesRouteV2(router);
  UsersRouteV2(router);
  PostsRouteV2(router);
  ArchivesRoute(router);
  ArchivesStatsRouteV2(router);
  NotificationsRoute(router);
  CommentLikesRoute(router);

  router.use('/v[0-9]+/*', (ctx) => {
    ctx.status = 404;
    ctx.body = { err: `API method not found: '${ctx.req.path}'` }
  });

  app.use(koaStatic(`${__dirname}/../${config.attachments.storage.rootDir}`));

  app.use(async (ctx, next) => {
    try {
      await next();
    } catch (e) {
      if (sentryIsEnabled) {
        Raven.captureException(e, { req: ctx.request });
      }

      reportError(ctx)(e);
    }
  });
  app.use(router.routes());
  app.use(router.allowedMethods());
}

/* eslint babel/semi: "error" */
import conditional from 'koa-conditional-get';
import etag from 'koa-etag';
import koaStatic from 'koa-static';
import Router from 'koa-router';

import { load as configLoader } from '../config/config';

import { reportError } from './support/exceptions';
import AttachmentsRoute from './routes/api/v1/AttachmentsRoute';
import BookmarkletRoute from './routes/api/v1/BookmarkletRoute';
import CommentsRoute from './routes/api/v1/CommentsRoute';
import GroupsRoute from './routes/api/v1/GroupsRoute';
import PasswordsRoute from './routes/api/v1/PasswordsRoute';
import PostsRoute from './routes/api/v1/PostsRoute';
import SessionRoute from './routes/api/v1/SessionRoute';
import TimelinesRoute from './routes/api/v1/TimelinesRoute';
import UsersRoute from './routes/api/v1/UsersRoute';
import GroupsRouteV2 from './routes/api/v2/GroupsRoute';
import RequestsRouteV2 from './routes/api/v2/RequestsRoute';
import SearchRoute from './routes/api/v2/SearchRoute';
import SummaryRoute from './routes/api/v2/SummaryRoute';
import TimelinesRouteV2 from './routes/api/v2/TimelinesRoute';
import UsersRouteV2 from './routes/api/v2/UsersRoute';
import StatsRouteV2 from './routes/api/v2/Stats';
import ArchivesStatsRouteV2 from './routes/api/v2/ArchivesStats';
import PostsRouteV2 from './routes/api/v2/PostsRoute';
import ArchivesRoute from './routes/api/v2/ArchivesRoute';
import NotificationsRoute from './routes/api/v2/NotificationsRoute';
import CommentLikesRoute from './routes/api/v2/CommentLikesRoute';
import InvitationsRoute from './routes/api/v2/InvitationsRoute';
import AppTokensRoute from './routes/api/v2/AppTokens';
import OauthRoute from './routes/api/v2/OauthRoute';
import { withAuthToken } from './controllers/middlewares/with-auth-token';


const config = configLoader();

export default function (app) {
  const router = new Router();

  // unauthenticated routes
  PasswordsRoute(router);
  SessionRoute(router);

  // Fix for ctx._matchedRoute
  // koa-router puts most generic instead of most specific route to the ctx._matchedRoute
  // See https://github.com/ZijianHe/koa-router/issues/246
  router.use((ctx, next) => {
    ctx._matchedRoute = ctx.matched.find((layer) => layer.methods.includes(ctx.method)).path;
    return next();
  });

  // [at least optionally] authenticated routes
  router.use(withAuthToken);

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
  InvitationsRoute(router);
  AppTokensRoute(router);
  OauthRoute(router);

  router.use('/v[0-9]+/*', (ctx) => {
    ctx.status = 404;
    ctx.body = { err: `API method not found: '${ctx.req.path}'` };
  });

  app.use(koaStatic(`${__dirname}/../${config.attachments.storage.rootDir}`));

  app.use(async (ctx, next) => {
    try {
      await next();
    } catch (e) {
      reportError(ctx)(e);
    }
  });

  // naive (hash-based) implementation of ETags for dynamic content
  app.use(conditional());
  app.use(etag());

  app.use(router.routes());
  app.use(router.allowedMethods());

  // Not Found middleware for API-like URIs
  app.use(async (ctx, next) => {
    if (/\/v\d+\//.test(ctx.url)) {
      ctx.status = 404;
      ctx.body = { err: `API method not found: '${ctx.url}'` };
      return;
    }

    await next();
  });
}

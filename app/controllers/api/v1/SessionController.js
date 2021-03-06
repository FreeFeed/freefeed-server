import passport from 'koa-passport';
import jwt from 'jsonwebtoken';
import config from 'config';
import compose from 'koa-compose';

import { SessionTokenV1 } from '../../../models/auth-tokens';
import { authRequired, inputSchemaRequired } from '../../middlewares';
import { BadRequestException } from '../../../support/exceptions';
import { CLOSED, statusTitles } from '../../../models/auth-tokens/SessionTokenV1';
import { sessionTokenV1Store } from '../../../models';

import UsersController from './UsersController';
import { updateListInputSchema } from './data-schemes/sessions';

export default class SessionController {
  static create(ctx) {
    return passport.authenticate('local', async (err, user, msg) => {
      if (err) {
        ctx.status = 401;
        ctx.body = { err: err.message };

        if (err.isResumable) {
          const { secret } = config;
          ctx.body.resumeToken = jwt.sign(
            {
              type: 'resume-account',
              userId: err.userId,
            },
            secret,
            { expiresIn: config.goneUsers.resumeTokenTTL },
          );
        }

        return;
      }

      if (user === false) {
        if (!msg) {
          msg = { message: 'Internal server error' };
        }

        ctx.status = 401;
        ctx.body = { err: msg.message };
        return;
      }

      const authToken = (await sessionTokenV1Store.create(user.id, ctx)).tokenString();

      // The same output as of the UsersController.show with 'authToken'
      ctx.params['username'] = user.username;
      await UsersController.show(ctx);
      ctx.body.authToken = authToken;
    })(ctx);
  }

  // Close current session
  static close = compose([
    authRequired(),
    sessionTypeRequired(),
    async (ctx) => {
      const { authToken } = ctx.state;

      const closed = await authToken.setStatus(CLOSED);

      ctx.body = { closed };
    },
  ]);

  // Reissue current session
  static reissue = compose([
    authRequired(),
    sessionTypeRequired(),
    async (ctx) => {
      const { authToken } = ctx.state;

      const reissued = await authToken.reissue();

      ctx.body = {
        authToken: authToken.tokenString(),
        reissued,
      };
    },
  ]);

  // Get list of sessions
  static list = compose([
    authRequired(),
    async (ctx) => {
      const { user, authToken: currentSession } = ctx.state;

      const sessions = await sessionTokenV1Store.list(user.id);
      const current = sessions.find((s) => s.id === currentSession.id)?.id;

      ctx.body = {
        current,
        sessions: sessions.map(serializeSession),
      };
    },
  ]);

  // Update sessions
  static updateList = compose([
    authRequired(),
    inputSchemaRequired(updateListInputSchema),
    async (ctx) => {
      const { user } = ctx.state;
      const { close: idsToClose } = ctx.request.body;

      const allSessions = await sessionTokenV1Store.list(user.id);

      // Close sessions
      await Promise.all(
        allSessions
          .filter((s) => s.isActive && idsToClose.includes(s.id))
          .map((s) => s.setStatus(CLOSED)),
      );

      await SessionController.list(ctx);
    },
  ]);
}

function sessionTypeRequired(types = [SessionTokenV1]) {
  return async (ctx, next) => {
    const { authToken } = ctx.state;

    if (!types.some((t) => authToken instanceof t)) {
      throw new BadRequestException(`This type of token isn't suitable for this request`);
    }

    await next();
  };
}

function serializeSession(session) {
  return {
    id: session.id,
    status: statusTitles[session.status],
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt,
    lastIP: session.lastIP,
    lastUserAgent: session.lastUserAgent,
  };
}

import passport from 'koa-passport'
import jwt from 'jsonwebtoken';
import config from 'config';
import compose from 'koa-compose';

import { SessionTokenV0, SessionTokenV1 } from '../../../models/auth-tokens'
import { authRequired } from '../../middlewares';
import { BadRequestException } from '../../../support/exceptions';
import { CLOSED } from '../../../models/auth-tokens/SessionTokenV1';

import UsersController from './UsersController';


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
              type:   'resume-account',
              userId: err.userId
            },
            secret, { expiresIn: config.goneUsers.resumeTokenTTL });
        }

        return;
      }

      if (user === false) {
        if (!msg) {
          msg = { message: 'Internal server error' }
        }

        ctx.status = 401;
        ctx.body = { err: msg.message };
        return
      }

      const authToken = (await dbAdapter.createAuthSession(user.id)).tokenString();

      // The same output as of the UsersController.show with 'authToken'
      ctx.params['username'] = user.username;
      await UsersController.show(ctx);
      ctx.body.authToken = authToken;
    })(ctx);
  }

  // Close current session
  static close = compose([
    authRequired(),
    sessionTypeRequired([SessionTokenV1, SessionTokenV0]),
    async (ctx) => {
      const { authToken } = ctx.state;

      let closed;

      if (authToken instanceof SessionTokenV1) {
        closed = await authToken.setStatus(CLOSED);
      } else {
        // Do nothing with SessionTokenV0
        closed = false;
      }

      ctx.body = { closed };
    },
  ]);

  // Reissue current session
  static reissue = compose([
    authRequired(),
    sessionTypeRequired([SessionTokenV1, SessionTokenV0]),
    async (ctx) => {
      const { authToken } = ctx.state;

      let reissued;

      if (authToken instanceof SessionTokenV1) {
        reissued = await authToken.reissue();
      } else {
        // Do nothing with SessionTokenV0
        reissued = false;
      }

      ctx.body = {
        authToken: authToken.tokenString(),
        reissued,
      };
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

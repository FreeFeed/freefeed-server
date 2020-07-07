import passport from 'koa-passport'
import jwt from 'jsonwebtoken';
import config from 'config';

import { SessionTokenV0 } from '../../../models/auth-tokens'

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
            secret, { expiresIn: '10m' });
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

      const authToken = new SessionTokenV0(user.id).tokenString();

      // The same output as of the UsersController.show with 'authToken'
      ctx.params['username'] = user.username;
      await UsersController.show(ctx);
      ctx.body.authToken = authToken;
    })(ctx);
  }
}

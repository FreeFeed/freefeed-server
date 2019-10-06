import passport from 'koa-passport'

import { UserSerializer } from '../../../models'
import { SessionTokenV0 } from '../../../models/auth-tokens'


export default class SessionController {
  static create(ctx) {
    return passport.authenticate('local', async (err, user, msg) => {
      if (err) {
        ctx.status = 401;
        ctx.body = { err: err.message };
        return
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

      const json = await new UserSerializer(user).promiseToJSON();
      ctx.body = { ...json, authToken };
    })(ctx);
  }
}

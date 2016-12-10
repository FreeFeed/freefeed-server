import passport from 'koa-passport'
import jwt from 'jsonwebtoken'

import { load as configLoader } from '../../../../config/config'
import { UserSerializer } from '../../../models'


const config = configLoader()

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

      const secret = config.secret
      const authToken = jwt.sign({ userId: user.id }, secret)

      const json = await new UserSerializer(user).promiseToJSON();
      ctx.body = { ...json, authToken };
    })(ctx);
  }
}

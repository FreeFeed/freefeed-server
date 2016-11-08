import passport from 'passport'
import jwt from 'jsonwebtoken'

import { load as configLoader } from '../../../../config/config'
import { UserSerializer } from '../../../models'
import { reportError }  from '../../../support/exceptions'


const config = configLoader()

export default class SessionController {
  static create(req, res) {
    passport.authenticate('local', async (err, user, msg) => {
      if (err) {
        res.status(401).jsonp({ err: err.message })
        return
      }

      if (user === false) {
        if (!msg) {
          msg = { message: 'Internal server error' }
        }

        res.status(401).jsonp({ err: msg.message })
        return
      }

      try {
        const secret = config.secret;
        const authToken = jwt.sign(user.jwtPayload(), secret);

        const json = await new UserSerializer(user).promiseToJSON()
        res.jsonp({ ...json, authToken });
      } catch (e) {
        reportError(res)(e);
      }
    })(req, res)
  }
}

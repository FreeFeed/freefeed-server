import passport from "passport"
import jwt from "jsonwebtoken"
import _ from "lodash"

import { load as configLoader } from "../../../../config/config"
import { UserSerializer } from "../../../models"


const config = configLoader()

export default class SessionController {
  static create(req, res) {
    passport.authenticate('local', async function(err, user, msg) {
      if (err) {
        res.status(401).jsonp({ err: err.message })
        return
      }

      if (user === false) {
        if (!msg) {
          msg = 'Internal server error'
        }

        res.status(401).jsonp({ err: msg })
        return
      }

      const secret = config.secret
      const authToken = jwt.sign({ userId: user.id }, secret)

      const json = await new UserSerializer(user).promiseToJSON()
      res.jsonp(_.extend(json, { authToken }))
    })(req, res)
  }
}

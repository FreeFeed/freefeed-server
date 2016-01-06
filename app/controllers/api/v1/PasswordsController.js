import { User } from '../../../models'
import { UserMailer } from '../../../mailers'
import exceptions from '../../../support/exceptions'


export default class PasswordsController {
  static async create(req, res) {
    var email = req.body.email

    if (email == null || email.length == 0) {
      res.jsonp({ err: "Email cannot be blank" })
      return
    }

    try {
      let user = await User.findByEmail(email)
      let token = await user.updateResetPasswordToken()

      UserMailer.resetPassword(user, { user })

      res.jsonp({ message: 'We will send a password reset link to ' + user.email + ' in a moment' })
    } catch (e) {
      exceptions.reportError(res)(e)
    }
  }

  static async update(req, res) {
    var token = req.params.resetPasswordToken

    if (token == null || token.length == 0) {
      res.jsonp({ err: "Token cannot be blank" })
      return
    }

    try {
      let user = await User.findByResetToken(token)
      await user.updatePassword(req.body.newPassword, req.body.passwordConfirmation)
      await user.updateResetPasswordToken()

      res.jsonp({ message: 'Your new password has been saved' })
    } catch (e) {
      exceptions.reportError(res)(e)
    }
  }
}

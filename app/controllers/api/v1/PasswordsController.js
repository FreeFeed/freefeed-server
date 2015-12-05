"use strict";

var models = require('../../../models')
  , UserMailer = require('../../../mailers').UserMailer
  , exceptions = require('../../../support/exceptions')

exports.addController = function(app) {
  var PasswordsController = function() {
  }

  PasswordsController.create = async function(req, res) {
    var email = req.body.email

    if (email == null || email.length == 0) {
      res.jsonp({ err: "Email cannot be blank" })
      return
    }

    try {
      let user = await models.User.findByEmail(email)
      let token = await user.updateResetPasswordToken()

      UserMailer.resetPassword(user, { user })

      res.jsonp({ message: 'We will send a password reset link to ' + user.email + ' in a moment' })
    } catch (e) {
      console.log(e)
      exceptions.reportError(res)(e)
    }
  }

  PasswordsController.update = async function(req, res) {
    var token = req.params.resetPasswordToken

    if (token == null || token.length == 0) {
      res.jsonp({ err: "Token cannot be blank" })
      return
    }

    try {
      let user = await models.User.findByResetToken(token)
      await user.updatePassword(req.body.newPassword, req.body.passwordConfirmation)
      await user.updateResetPasswordToken()

      res.jsonp({ message: 'Your new password has been saved' })
    } catch (e) {
      exceptions.reportError(res)(e)
    }
  }

  return PasswordsController
}


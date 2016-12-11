import { dbAdapter } from '../../../models'
import { UserMailer } from '../../../mailers'
import { NotFoundException } from '../../../support/exceptions'


export default class PasswordsController {
  static async create(ctx) {
    const email = ctx.request.body.email

    if (email == null || email.length == 0) {
      ctx.status = 400;
      ctx.body = { err: 'Email cannot be blank' };
      return
    }

    const user = await dbAdapter.getUserByEmail(email)

    if (null === user) {
      throw new NotFoundException(`Invalid email address or user not found`)
    }

    await user.updateResetPasswordToken();
    await UserMailer.resetPassword(user, { user });

    ctx.body = { message: `Password reset link has been sent to ${user.email}` };
  }

  static async update(ctx) {
    const token = ctx.params.resetPasswordToken

    if (token == null || token.length == 0) {
      ctx.status = 400;
      ctx.body = { err: 'Token cannot be blank' };
      return
    }

    const user = await dbAdapter.getUserByResetToken(token)

    if (null === user) {
      throw new NotFoundException(`Password reset token not found or has expired`)
    }

    await user.updatePassword(ctx.request.body.newPassword, ctx.request.body.passwordConfirmation)
    await user.updateResetPasswordToken()

    ctx.body = { message: 'Your new password has been saved' };
  }
}

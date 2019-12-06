import config from 'config'

import Mailer from '../../lib/mailer'


export default class UserMailer {
  static async resetPassword(user, locals) {
    const subject = config.mailer.resetPasswordMailSubject

    await Mailer.sendMail(user, subject, locals, `${config.appRoot}/app/scripts/views/mailer/resetPassword.ejs`)
  }
}

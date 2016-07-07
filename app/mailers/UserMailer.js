import Mailer from '../../lib/mailer'
import { load as configLoader } from '../../config/config'


let config = configLoader()

export default class UserMailer {
  static async resetPassword(user, locals) {
    var subject = config.mailer.resetPasswordMailSubject

    await Mailer.sendMail(user, subject, locals, `${config.appRoot}/app/scripts/views/mailer/resetPassword.ejs`)
  }
}

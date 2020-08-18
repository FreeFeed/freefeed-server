import config from 'config';

import Mailer from '../../lib/mailer';


export default class UserMailer {
  static async resetPassword(user, locals) {
    const subject = config.mailer.resetPasswordMailSubject;
    // User may be inactive but we still should be able to send this email
    const recipient = {
      screenName: user.screenName,
      email:      user.hiddenEmail || user.email,
    };

    await Mailer.sendMail(
      recipient,
      subject,
      locals,
      `${config.appRoot}/app/scripts/views/mailer/resetPassword.ejs`
    );
  }
}

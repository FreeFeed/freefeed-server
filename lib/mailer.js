import ejs from 'ejs';
import _ from 'lodash';
import nodemailer from 'nodemailer';
import createDebug from 'debug';
import config from 'config';


const debug = createDebug('freefeed:mailer');

const defaultSubjectTransformation = (subject) => {
  return _.truncate(subject, { length: 50 });
};

export default class Mailer {
  static formatUsername(name, address) {
    return { name, address };
  }

  static async sendMail(recipient, subject, locals, file, sendAsHtml = false, attachments = []) {
    locals.config = config;
    const plainText = await ejs.renderFile(file, locals, { async: true });
    const subjectTransformFn = _.get(locals, 'mailerConfig.subjectTransformation', defaultSubjectTransformation);
    const transformedSubject = subjectTransformFn(subject);

    const message = {
      to:      Mailer.formatUsername(recipient.screenName, recipient.email),
      subject: transformedSubject,
      text:    plainText,
      from:    Mailer.formatUsername(config.mailer.fromName, config.mailer.fromEmail),
      headers: { 'X-Laziness-level': 1000 }
    };

    if (attachments.length) {
      message.attachments = attachments;
    }

    if (sendAsHtml) {
      delete message.text;
      message.html = plainText;
    }

    debug(`Sending Mail to ${recipient.email}…`);

    const transporter = nodemailer.createTransport(config.mailer.transport(config.mailer.options));

    try {
      const result = await transporter.sendMail(message);
      debug('Message sent successfully.');

      for (const listener of mailListeners) {
        listener(result);
      }
    } catch (e) {
      debug(`Error: ${e.message}`);
    } finally {
      transporter.close()
    }
  }
}

// Collection of mail listeners for testing purposes
const mailListeners = [];

export function addMailListener(listener) {
  mailListeners.push(listener);
  // Return the unsubscribe function
  return () => mailListeners.splice(mailListeners.indexOf(listener) >>> 0, 1);
}

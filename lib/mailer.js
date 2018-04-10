import fs from 'fs'

import { promisifyAll } from 'bluebird'
import ejs from 'ejs'
import _ from 'lodash'
import nodemailer from 'nodemailer'
import createDebug from 'debug';

import { load as configLoader } from '../config/config'


promisifyAll(fs);
const config = configLoader();
const debug = createDebug('freefeed:mailer');

export default class Mailer {
  static formatUsername(name, email) {
    return `${name} <${email}>`
  }

  static async sendMail(recipient, subject, locals, file, sendAsHtml = false, attachments = []) {
    const template = await fs.readFileAsync(file, 'utf8')

    locals.config = config
    const plainText = ejs.render(template, locals)

    const message = {
      to:      Mailer.formatUsername(recipient.screenName, recipient.email),
      subject: _.truncate(subject, 50),
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

    const transporter = nodemailer.createTransport(config.mailer.transport(config.mailer.options))

    try {
      await transporter.sendMail(message);
      debug('Message sent successfully.');
    } catch (e) {
      debug(`Error: ${e.message}`);
    } finally {
      transporter.close()
    }
  }
}

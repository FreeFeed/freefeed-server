import fs from 'fs'

import { promisifyAll } from 'bluebird'
import ejs from 'ejs'
import _ from 'lodash'
import nodemailer from 'nodemailer'
import logger from 'winston'

import { load as configLoader } from '../config/config'


promisifyAll(fs)
let config = configLoader()

export default class Mailer {
  static formatUsername(name, email) {
    return name + ' <' + email + '>'
  }

  static async sendMail(recipient, subject, locals, file) {
    const template = await fs.readFileAsync(file, 'utf8')

    locals.config = config
    const plainText = ejs.render(template, locals)

    const message = {
      to: Mailer.formatUsername(recipient.screenName, recipient.email),
      subject: _.truncate(subject, 50),
      text: plainText,
      from: Mailer.formatUsername(config.mailer.fromName, config.mailer.fromEmail),
      headers: {
        'X-Laziness-level': 1000
      }
    }

    logger.info(`Sending Mail to ${recipient.email}…`)

    const transporter = nodemailer.createTransport(config.mailer.transport(config.mailer.options))

    try {
      await transporter.sendMail(message)
      logger.info('Message sent successfully.')
    } catch (e) {
      logger.info('Error occured!')
      logger.info(e.message)
    } finally {
      transporter.close()
    }
  }
}

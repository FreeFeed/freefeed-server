import _fs from 'fs'

import { promisifyAll } from 'bluebird'
import ejs from 'ejs'
import _ from 'lodash'
import nodemailer from 'nodemailer'
import logger from 'winston'

import { load as configLoader } from '../config/config'


let fs = promisifyAll(_fs)
let config = configLoader()

export default class Mailer {
  static formatUsername(name, email) {
    return name + ' <' + email + '>'
  }

  static sendMail(recipient, subject, locals, file) {
    fs.readFileAsync(file, 'utf8')
      .then(function (template) {
        locals.config = config
        var plainText = ejs.render(template, locals)

        var message = {
          to: Mailer.formatUsername(recipient.screenName, recipient.email),
          subject: _.trunc(subject, 50),
          text: plainText
        }

        var transporter = nodemailer.createTransport(config.mailer.transport(config.mailer.options))

        logger.info('Sending Mail to ' + recipient.email + '...')

        message.from = Mailer.formatUsername(config.mailer.fromName, config.mailer.fromEmail)
        message.headers = {
          'X-Laziness-level': 1000
        }

        transporter.sendMail(message, function(error) {
          if (error) {
            logger.info('Error occured!')
            logger.info(error.message)
            return
          }

          logger.info('Message sent successfully.')

          transporter.close()
        })
      })
  }
}

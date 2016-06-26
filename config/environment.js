import fs from 'fs'

import bodyParser from 'body-parser'
import methodOverride from 'method-override'
import morgan from 'morgan'
import passport from 'passport'
import winston from 'winston'
import { promisify } from 'bluebird';

import { init as originInit } from './initializers/origin'
import { load as configLoader } from "./config"
import { selectDatabase } from './database'
import { init as passportInit } from './initializers/passport'


const config = configLoader()
const env = process.env.NODE_ENV || 'development'

passportInit(passport)

async function selectEnvironment(app) {
  app.config = config
  app.logger = new (winston.Logger)({
    transports: [
      new (winston.transports.Console)({
        'timestamp': true,
        'level': config.logLevel || 'debug',
        handleExceptions: true
      })
    ]
  })

  app.set('redisdb', config.database)
  app.set('port', process.env.PORT || config.port)

  await selectDatabase()

  return app
}

exports.init = async function(app) {
  await selectEnvironment(app)

  if (config.media.storage.type === 'fs') {
    const access = promisify(fs.access);
    let gotErrors = false;

    const attachmentsDir = config.attachments.storage.rootDir + config.attachments.path;

    try {
      await access(attachmentsDir, fs.W_OK);
    } catch (e) {
      gotErrors = true;
      app.logger.error(`Attachments dir does not exist: ${attachmentsDir}`)
    }

    for (const sizeId of Object.keys(config.attachments.imageSizes)) {
      const sizeConfig = config.attachments.imageSizes[sizeId];
      const thumbnailsDir = config.attachments.storage.rootDir + sizeConfig.path;

      try {
        await access(thumbnailsDir, fs.W_OK);
      } catch (e) {
        gotErrors = true;
        app.logger.error(`Thumbnails dir does not exist: ${thumbnailsDir}`)
      }
    }

    if (gotErrors) {
      throw new Error(`some of required directories are missing`);
    }
  }

  app.use(bodyParser.json({limit: config.attachments.fileSizeLimit}))
  app.use(bodyParser.urlencoded({limit: config.attachments.fileSizeLimit, extended: true}))
  app.use(passport.initialize())
  app.use(originInit)
  app.use(methodOverride(function(req) {
    if (req.body && typeof req.body === 'object' && '_method' in req.body) {
      // look in urlencoded POST bodies and delete it
      var method = req.body._method
      delete req.body._method
      return method
    }
  }))

  var accessLogStream = fs.createWriteStream(__dirname + '/../log/' + env + '.log', {flags: 'a'})
  app.use(morgan('combined', {stream: accessLogStream}))

  return app
}

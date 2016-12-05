import fs from 'fs'

import bodyParser from 'body-parser'
import methodOverride from 'method-override'
import morgan from 'morgan'
import passport from 'passport'
import winston from 'winston'
import responseTime from 'response-time'
import { promisify } from 'bluebird';

import { init as originInit } from './initializers/origin'
import { load as configLoader } from './config'
import { selectDatabase } from './database'
import { configure as configurePostgres } from './postgres'
import { init as passportInit } from './initializers/passport'


const config = configLoader()
const env = process.env.NODE_ENV || 'development'

passportInit(passport)

async function selectEnvironment(app) {
  app.config = config
  app.logger = new (winston.Logger)({
    transports: [
      new (winston.transports.Console)({
        timestamp:        true,
        level:            config.logLevel || 'debug',
        handleExceptions: true
      })
    ]
  })

  app.set('redisdb', config.database)
  app.set('port', process.env.PORT || config.port)

  await selectDatabase()
  await configurePostgres()

  return app
}

exports.init = async function (app) {
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

    const checkPromises = Object.values(config.attachments.imageSizes).map(async (sizeConfig) => {
      const thumbnailsDir = config.attachments.storage.rootDir + sizeConfig.path;

      try {
        await access(thumbnailsDir, fs.W_OK);
      } catch (e) {
        gotErrors = true;
        app.logger.error(`Thumbnails dir does not exist: ${thumbnailsDir}`);
      }
    });
    await Promise.all(checkPromises);

    if (gotErrors) {
      throw new Error(`some of required directories are missing`);
    }
  }

  app.use(bodyParser.json({ limit: config.attachments.fileSizeLimit }))
  app.use(bodyParser.urlencoded({ limit: config.attachments.fileSizeLimit, extended: true }))
  app.use(passport.initialize())
  app.use(originInit)
  app.use(methodOverride((req) => {
    if (req.body && typeof req.body === 'object' && '_method' in req.body) {
      // look in urlencoded POST bodies and delete it
      const method = req.body._method
      delete req.body._method
      return method
    }

    return undefined;  // otherwise, no need to override
  }));

  const accessLogStream = fs.createWriteStream(`${__dirname}/../log/${env}.log`, { flags: 'a' })
  app.use(morgan('combined', { stream: accessLogStream }))

  if (config.logResponseTime) {
    app.use(responseTime((req, res, time) => {
      const val = `${time.toFixed(3)}ms`
      res.setHeader('X-Response-Time', val)
      const resource = (req.method + req.url).toLowerCase()
      app.logger.warn(resource, time)
    }))
  }

  return app
}

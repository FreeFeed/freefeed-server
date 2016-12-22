import fs from 'fs'

import koaBody from 'koa-body';
import methodOverride from 'koa-methodoverride';
import morgan from 'koa-morgan';
import passport from 'koa-passport';
import winston from 'winston'
import responseTime from 'koa-response-time'
import { promisify } from 'bluebird';

import { originMiddleware } from './initializers/origin';
import { load as configLoader } from './config';
import { selectDatabase } from './database'
import { configure as configurePostgres } from './postgres'
import { init as passportInit } from './initializers/passport'


const config = configLoader()
const env = process.env.NODE_ENV || 'development'

passportInit(passport)

async function selectEnvironment(app) {
  app.context.config = config;
  app.context.port = process.env.PORT || config.port;
  app.context.logger = new (winston.Logger)({
    transports: [
      new (winston.transports.Console)({
        timestamp:        true,
        level:            config.logLevel || 'debug',
        handleExceptions: true
      })
    ]
  })

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
      app.context.logger.error(`Attachments dir does not exist: ${attachmentsDir}`)
    }

    const checkPromises = Object.values(config.attachments.imageSizes).map(async (sizeConfig) => {
      const thumbnailsDir = config.attachments.storage.rootDir + sizeConfig.path;

      try {
        await access(thumbnailsDir, fs.W_OK);
      } catch (e) {
        gotErrors = true;
        app.context.logger.error(`Thumbnails dir does not exist: ${thumbnailsDir}`);
      }
    });
    await Promise.all(checkPromises);

    if (gotErrors) {
      throw new Error(`some of required directories are missing`);
    }
  }

  app.use(koaBody({
    multipart: true,
    formLimit: config.attachments.fileSizeLimit,
    jsonLimit: config.attachments.fileSizeLimit,
    textLimit: config.attachments.fileSizeLimit
  }));
  app.use(passport.initialize())
  app.use(originMiddleware);
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

  if (config.logResponseTime) {  // should be located BEFORE responseTime
    app.use(async (ctx, next) => {
      await next();

      const time = ctx.response.get('X-Response-Time');
      const resource = (ctx.request.method + ctx.request.url).toLowerCase();

      app.context.logger.info(resource, time);
    });
  }

  app.use(responseTime());

  return app
}

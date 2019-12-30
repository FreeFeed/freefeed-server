import fs from 'fs';

import koaBody from 'koa-body';
import methodOverride from 'koa-methodoverride';
import morgan from 'koa-morgan';
import passport from 'koa-passport';
import responseTime from 'koa-response-time';
import { promisify } from 'bluebird';
import Raven from 'raven';
import createDebug from 'debug';
import config from 'config';

import { version as serverVersion } from '../../package.json';

import { selectDatabase } from './database';
import { configure as configurePostgres } from './postgres';
import { originMiddleware } from './initializers/origin';
import { init as passportInit } from './initializers/passport';


const sentryIsEnabled = 'sentryDsn' in config;

if (sentryIsEnabled) {
  Raven.config(config.sentryDsn, { autoBreadcrumbs: true }).install();
}

const env = process.env.NODE_ENV || 'development';
const log = createDebug('freefeed:init');
process.env.MONITOR_PREFIX = config.monitorPrefix;

passportInit(passport);

async function selectEnvironment(app) {
  app.context.config = config;
  app.context.port = process.env.PORT || config.port;

  await selectDatabase();
  await configurePostgres();

  return app;
}

exports.init = async function (app) {
  await selectEnvironment(app);

  if (config.media.storage.type === 'fs') {
    const access = promisify(fs.access);
    let gotErrors = false;

    const attachmentsDir = config.attachments.storage.rootDir + config.attachments.path;

    try {
      await access(attachmentsDir, fs.W_OK);
    } catch (e) {
      gotErrors = true;
      log(`Attachments dir does not exist: ${attachmentsDir}`);
    }

    const checkPromises = Object.values(config.attachments.imageSizes).map(async (sizeConfig) => {
      const thumbnailsDir = config.attachments.storage.rootDir + sizeConfig.path;

      try {
        await access(thumbnailsDir, fs.W_OK);
      } catch (e) {
        gotErrors = true;
        log(`Thumbnails dir does not exist: ${thumbnailsDir}`);
      }
    });
    await Promise.all(checkPromises);

    if (gotErrors) {
      throw new Error(`some of required directories are missing`);
    }
  }

  if (config.trustProxyHeaders) {
    app.proxy = true;
  }

  app.use(koaBody({
    multipart:  true,
    formLimit:  config.attachments.fileSizeLimit,
    jsonLimit:  config.attachments.fileSizeLimit,
    textLimit:  config.attachments.fileSizeLimit,
    formidable: { maxFileSize: config.attachments.fileSizeLimit, }
  }));
  app.use(passport.initialize());
  app.use(originMiddleware);
  app.use(methodOverride((req) => {
    if (req.body && typeof req.body === 'object' && '_method' in req.body) {
      // look in urlencoded POST bodies and delete it
      const method = req.body._method;
      Reflect.deleteProperty(req.body, '_method');
      return method;
    }

    return undefined;  // otherwise, no need to override
  }));

  app.use(async (ctx, next) => {
    ctx.response.set('X-Freefeed-Server', serverVersion);
    await next();
  });

  const accessLogStream = fs.createWriteStream(`${__dirname}/../../log/${env}.log`, { flags: 'a' });
  app.use(morgan('combined', { stream: accessLogStream }));

  if (config.logResponseTime) {  // should be located BEFORE responseTime
    const timeLogger = createDebug('freefeed:request');
    app.use(async (ctx, next) => {
      await next();

      const time = ctx.response.get('X-Response-Time');
      const resource = (ctx.request.method + ctx.request.url).toLowerCase();

      timeLogger(resource, time);
    });
  }

  app.use(responseTime());

  return app;
};

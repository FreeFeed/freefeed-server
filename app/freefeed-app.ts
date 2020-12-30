import fs from 'fs';

import createDebug from 'debug';
import Application from 'koa';
import config from 'config';
import koaBody from 'koa-body';
import methodOverride from 'koa-methodoverride';
import morgan from 'koa-morgan';
import responseTime from 'koa-response-time';
import passport from 'koa-passport';
import conditional from 'koa-conditional-get';
import etag from 'koa-etag';
import koaStatic from 'koa-static';

import { version as serverVersion } from '../package.json';

import { koaServerTiming } from './support/koa-server-timing';
import { originMiddleware } from './setup/initializers/origin';
import { maintenanceCheck } from './support/maintenance';
import { reportError } from './support/exceptions';
import { normalizeInputStrings } from './controllers/middlewares/normalize-input';

const env = process.env.NODE_ENV || 'development';

class FreefeedApp extends Application {
  constructor(options: Record<string, unknown> | undefined = {}) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore  // error in ts-definition
    super(options);

    if (config.trustProxyHeaders) {
      this.proxy = true;
    }

    this.context.config = config;
    this.context.port = process.env.PORT || config.port;

    this.use(
      koaBody({
        multipart: true,
        formLimit: config.attachments.fileSizeLimit,
        jsonLimit: config.attachments.fileSizeLimit,
        textLimit: config.attachments.fileSizeLimit,
        formidable: { maxFileSize: config.attachments.fileSizeLimit },
      }),
    );
    this.use(passport.initialize());
    this.use(originMiddleware);
    this.use(
      methodOverride((req) => {
        if (req.body && typeof req.body === 'object' && '_method' in req.body) {
          // look in urlencoded POST bodies and delete it
          const method = req.body._method;
          Reflect.deleteProperty(req.body, '_method');
          return method;
        }

        return undefined; // otherwise, no need to override
      }),
    );

    this.use(async (ctx, next) => {
      ctx.response.set('X-Freefeed-Server', serverVersion);
      await next();
    });

    const accessLogStream = fs.createWriteStream(`${__dirname}/../log/${env}.log`, { flags: 'a' });
    this.use(morgan('combined', { stream: accessLogStream }));

    if (config.logResponseTime) {
      // should be located BEFORE responseTime
      const timeLogger = createDebug('freefeed:request');
      this.use(async (ctx, next) => {
        await next();

        const time = ctx.response.get('X-Response-Time');
        const resource = (ctx.request.method + ctx.request.url).toLowerCase();

        timeLogger(resource, time);
      });
    }

    this.use(responseTime());
    this.use(koaServerTiming());

    this.use(koaStatic(`${__dirname}/../${config.attachments.storage.rootDir}`));

    this.use(maintenanceCheck);

    this.use(async (ctx, next) => {
      try {
        await next();
      } catch (e) {
        reportError(ctx)(e);
      }
    });

    // naive (hash-based) implementation of ETags for dynamic content
    this.use(conditional());
    this.use(etag());
    this.use(normalizeInputStrings);
  }
}

export default FreefeedApp;

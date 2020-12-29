import fs from 'fs';

import smtpTransport from 'nodemailer-smtp-transport';
import { deferConfig as defer } from 'config/defer';

const stubTransport = function () {
  return {
    name: 'minimal',
    version: '0.1.0',
    send: function (mail, callback) {
      const input = mail.message.createReadStream();
      input.pipe(process.stdout);
      input.on('end', () => {
        callback(null, true);
      });
    },
  };
};

const config = {
  siteTitle: 'FreeFeed',

  port: 3000,
  database: 2,

  // You MUST override the site secret in your config
  secret: undefined,

  origin: 'http://localhost:3333',
  appRoot: '.',
  acceptHashedPasswordsOnly: false,

  // Configure koa app to trust proxy headers:
  // X-Forwarded-Host, X-Forwarded-Proto and X-Forwarded-For
  trustProxyHeaders: false,

  logResponseTime: true,
  // disableRealtime: true,
  onboardingUsername: 'welcome',
  recaptcha: { enabled: false },
  // sentryDsn: '',

  frontendPreferencesLimit: 65536,

  monitorPrefix: 'development',
};

// Site instance owner's requisites for use in the digest email footers
config.company = {
  title: 'Our Company',
  address: 'Our Company Address, City, Country',
};

config.host = defer((cfg) => `http://localhost:${cfg.port}`);

config.application = {
  // Unavailable for registration (reserved for internal use)
  USERNAME_STOP_LIST: [
    '404',
    'about',
    'account',
    'anonymous',
    'attachments',
    'dev',
    'files',
    'filter',
    'friends',
    'groups',
    'help',
    'home',
    'iphone',
    'list',
    'logout',
    'profilepics',
    'public',
    'requests',
    'search',
    'settings',
    'share',
    'signin',
    'signup',
    'summary',
  ],

  // Path to the file contains usernames unavailable for registration
  // (plain text file, one username per line).
  extraStopListPath: null,

  EXTRA_STOP_LIST: defer((cfg) => {
    const { extraStopListPath } = cfg.application;

    if (!extraStopListPath) {
      return [];
    }

    return fs.readFileSync(extraStopListPath).toString().split('\n').filter(Boolean);
  }),
};

config.media = {
  // Public URL prefix
  url: defer((cfg) => `${cfg.host}/`), // must have trailing slash

  // File storage
  storage: {
    // 'fs' for local file system or 's3' for AWS S3
    type: 'fs',

    // Parameters for 'fs'
    rootDir: './public/files/', // must have trailing slash

    // Parameters for 's3'
    accessKeyId: 'ACCESS-KEY-ID',
    secretAccessKey: 'SECRET-ACCESS-KEY',
    bucket: 'bucket-name',
    // endpoint:        'nyc3.digitaloceanspaces.com',
  },
};
config.attachments = {
  url: defer((cfg) => cfg.media.url),
  storage: defer((cfg) => cfg.media.storage),
  path: 'attachments/', // must have trailing slash
  fileSizeLimit: 10 * 1000 * 1000,
  maxCount: 20,
  imageSizes: {
    t: {
      path: 'attachments/thumbnails/', // must have trailing slash
      bounds: { width: 525, height: 175 },
    },
    t2: {
      path: 'attachments/thumbnails2/', // must have trailing slash
      bounds: { width: 1050, height: 350 },
    },
  },
};
config.profilePictures = {
  defaultProfilePictureMediumUrl: 'http://placekitten.com/50/50',

  url: defer((cfg) => cfg.media.url),
  storage: defer((cfg) => cfg.media.storage),
  path: 'profilepics/', // must have trailing slash
};

config.mailer = {
  useSMTPTransport: false,
  transport: defer((cfg) => (cfg.mailer.useSMTPTransport ? smtpTransport : stubTransport)),
  fromName: 'Pepyatka',
  fromEmail: 'mail@pepyatka.com',
  resetPasswordMailSubject: 'Pepyatka password reset',
  host: defer((cfg) => cfg.host),
  options: {},
  adminRecipient: { email: 'admin@pepyatka.com', screenName: 'Pepyatka admin' },
};

config.redis = {
  host: 'localhost',
  port: 6379,
  options: {},
  retry_strategy: function (options) {
    if (options.error && options.error.code === 'ECONNREFUSED') {
      // End reconnecting on a specific error and flush all commands with
      // a individual error
      return new Error('The server refused the connection');
    }

    if (options.total_retry_time > 1000 * 60 * 60) {
      // End reconnecting after a specific timeout and flush all commands
      // with a individual error
      return new Error('Retry time exhausted');
    }

    if (options.attempt > 10) {
      // End reconnecting with built in error
      return undefined;
    }

    // reconnect after
    return Math.min(options.attempt * 100, 3000);
  },
};

config.performance = {
  // PostgreSQL 'statement_timeout' for search queries in milliseconds (0 => no timeout)
  searchQueriesTimeout: 0,
};

config.postgres = {
  client: 'postgresql',
  connection: {
    host: 'localhost',
    port: 5432,
    database: 'freefeed',
    user: 'freefeed',
    password: 'freefeed',
  },
  pool: {
    min: 2,
    max: 10,
  },
  migrations: { tableName: 'knex_migrations' },
  textSearchConfigName: 'pg_catalog.russian',
};

/**
 * Fill this array with provider-specific credentials like:
 *
 * [
 *   {
 *     template: 'google',
 *     params: {
 *       clientId:     '####',
 *       clientSecret: '####',
 *     },
 *   },
 * ]
 *
 * See the **external-auth-providers.md** file in this dir for more information.
 */
config.externalAuthProviders = [];

const FBVersion = 'v8.0';
config.externalAuthTemplates = {
  google: {
    id: 'google',
    brand: 'google',
    title: 'Google',
    adapter: 'oauth2',
    params: { discoveryRoot: 'https://accounts.google.com' },
  },

  facebook: {
    id: 'facebook',
    brand: 'facebook',
    title: 'Facebook',
    adapter: 'oauth2',
    params: {
      authorizationEndpoint: `https://www.facebook.com/${FBVersion}/dialog/oauth`,
      tokenEndpoint: `https://graph.facebook.com/${FBVersion}/oauth/access_token`,
      userinfoEndpoint: `https://graph.facebook.com/${FBVersion}/me?fields=name,email,picture`,
      scope: 'email',
      userInfoFields: {
        id: 'id',
        name: 'name',
        email: 'email',
        pictureURL: 'picture.data.url',
      },
    },
  },

  github: {
    id: 'github',
    brand: 'github',
    title: 'GitHub',
    adapter: 'oauth2',
    params: {
      authorizationEndpoint: 'https://github.com/login/oauth/authorize',
      tokenEndpoint: 'https://github.com/login/oauth/access_token',
      userinfoEndpoint: 'https://api.github.com/user',
      scope: 'user:email',
      userInfoFields: {
        id: 'id',
        pictureURL: 'avatar_url',
      },
    },
  },
};

config.registrationsLimit = {
  interval: '1 day', // PostgreSQL 'interval' type syntax
  maxCount: 100,
};

config.search = {
  maxQueryComplexity: 30,
  minPrefixLength: 2,
};

config.maintenance = { messageFile: 'tmp/MAINTENANCE.txt' };

config.eslint = { linebreakStyle: null };

config.goneUsers = {
  //
  resumeTokenTTL: 600, // in seconds
};

config.jobManager = {
  pollInterval: 5, // in seconds
  jobLockTime: 120, // in seconds
  batchSize: 5,
};

config.userDeletion = {
  cooldownDays: 30, // in days
  reminderDays: 27, // in days
};

config.ianaTimeZone = 'Europe/Tallinn';

config.appTokens = {
  //
  activationCodeTTL: 300, // in seconds
};

config.authSessions = {
  usageDebounceSec: 30,
  reissueGraceIntervalSec: 300,
  // Cleanup
  activeSessionTTLDays: 60,
  // TODO The inactiveSessionTTLDays should be reduced to a few days when the V0 sessions become deprecated
  inactiveSessionTTLDays: 60,
  cleanupIntervalSec: 3600, // one hour
};

module.exports = config;

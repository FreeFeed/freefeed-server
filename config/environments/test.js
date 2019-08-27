import stubTransport from 'nodemailer-stub-transport';

import { test as postgresConfig } from '../../knexfile';


// Clustering for monitor-dogstats @todo replace in ansible-deploy
process.env.MONITOR_PREFIX = 'tests';

export function getConfig() {
  const config = {
    port:     31337,
    database: 3,

    secret:                    'secret',
    origin:                    'http://localhost:3333',
    appRoot:                   '.',
    acceptHashedPasswordsOnly: false,

    // Configure koa app to trust proxy headers:
    // X-Forwarded-Host, X-Forwarded-Proto and X-Forwarded-For
    trustProxyHeaders: false,

    // disableRealtime: true,
    onboardingUsername: 'welcome',
    recaptcha:          { enabled: false },

    frontendPreferencesLimit: 65536,

    // needed for retrieving authToken from cookies (for OAuth callbacks)
    authTokenPrefix: 'freefeed_',
  };

  config.host = `http://localhost:${config.port}`;

  config.application = {
    USERNAME_STOP_LIST: [
      '404', 'about', 'account', 'anonymous', 'attachments', 'dev', 'files', 'filter',
      'friends', 'groups', 'help', 'home', 'iphone', 'list', 'logout', 'profilepics',
      'public', 'requests', 'search', 'settings', 'share', 'signin', 'signup', 'summary'
    ],
    EXTRA_STOP_LIST: [
      'thatcreepyguy', 'nicegirlnextdoor', 'perfectstranger'
    ]
  };

  config.media = {
    url:     `${config.host}/`, // must have trailing slash
    storage: {
      type:    'fs',
      rootDir: '/tmp/pepyatka-media/' // must have trailing slash
    }
  };
  config.attachments = {
    url:           config.media.url,
    storage:       config.media.storage,
    path:          'attachments/', // must have trailing slash
    fileSizeLimit: 10 * 1000 * 1000,
    maxCount:      20,
    imageSizes:    {
      t: {
        path:   'attachments/thumbnails/', // must have trailing slash
        bounds: { width: 525, height: 175 }
      },
      t2: {
        path:   'attachments/thumbnails2/', // must have trailing slash
        bounds: { width: 1050, height: 350 }
      },
      anotherTestSize: {
        path:   'attachments/anotherTestSize/', // must have trailing slash
        bounds: { width: 1600, height: 1200 }
      }
    }
  };
  config.profilePictures = {
    defaultProfilePictureMediumUrl: 'http://placekitten.com/50/50',

    url:     config.media.url,
    storage: config.media.storage,
    path:    'profilepics/' // must have trailing slash
  };

  config.mailer = {
    transport:                stubTransport,
    fromName:                 'Pepyatka',
    fromEmail:                'mail@pepyatka.com',
    resetPasswordMailSubject: 'Pepyatka password reset',
    host:                     config.origin,
    options:                  {},
    adminRecipient:           { email: 'admin@pepyatka.com', screenName: 'Pepyatka admin' },
  };

  config.redis = {
    host:    'localhost',
    port:    6379,
    options: {}
  };

  config.performance = {
    // PostgreSQL 'statement_timeout' for search queries in milliseconds (0 => no timeout)
    searchQueriesTimeout: 0,
  };

  config.oauth = {
    facebookClientId:     'test',
    facebookClientSecret: 'test',
    googleClientId:       'test',
    googleClientSecret:   'test',
    githubClientId:       'test',
    githubClientSecret:   'test',
  };

  config.postgres = postgresConfig;

  return config;
}

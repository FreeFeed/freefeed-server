import stubTransport from 'nodemailer-stub-transport'
import { test as postgresConfig } from '../../knexfile'


// Clustering for monitor-dogstats @todo replace in ansible-deploy
process.env.MONITOR_PREFIX = 'tests'

export function getConfig() {
  const config = {
    port:     31337,
    database: 3,

    secret:                    'secret',
    origin:                    'http://localhost:3333',
    appRoot:                   '.',
    acceptHashedPasswordsOnly: false,

    logLevel:           'warn',
    // disableRealtime: true,
    onboardingUsername: 'welcome',
    recaptcha:          { enabled: false },

    frontendPreferencesLimit: 65536
  }

  config.host = `http://localhost:${config.port}`

  config.application = {
    USERNAME_STOP_LIST: [
      '404', 'about', 'account', 'anonymous', 'attachments', 'dev', 'files', 'filter',
      'friends', 'groups', 'help', 'home', 'iphone', 'list', 'logout', 'profilepics',
      'public', 'requests', 'search', 'settings', 'share', 'signin', 'signup', 'summary'
    ],
    EXTRA_STOP_LIST: [
      'thatcreepyguy', 'nicegirlnextdoor', 'perfectstranger'
    ]
  }

  config.media = {
    url:     `${config.host}/`, // must have trailing slash
    storage: {
      type:    'fs',
      rootDir: '/tmp/pepyatka-media/' // must have trailing slash
    }
  }
  config.attachments = {
    url:           config.media.url,
    storage:       config.media.storage,
    path:          'attachments/', // must have trailing slash
    fileSizeLimit: '10mb',
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
  }
  config.profilePictures = {
    url:     config.media.url,
    storage: config.media.storage,
    path:    'profilepics/' // must have trailing slash
  }

  config.mailer = {
    transport: stubTransport,
    options:   {}
  }

  config.redis = {
    host:    'localhost',
    port:    6379,
    options: {}
  }

  config.postgres = postgresConfig

  return config
}

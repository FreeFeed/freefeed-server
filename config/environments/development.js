// Clustering for monitor-dogstats @todo replace in ansible-deploy
process.env.MONITOR_PREFIX = 'development'

var transport = function() {
  return {
    name: 'minimal',
    version: '0.1.0',
    send: function(mail, callback) {
      var input = mail.message.createReadStream();
      input.pipe(process.stdout);
      input.on('end', function() {
        callback(null, true)
      })
    }
  }
}

export function getConfig() {
  var config = {
    port: 3000,
    database: 2,

    secret: 'secret',
    origin: 'http://localhost:3333',
    appRoot: '.',
    acceptHashedPasswordsOnly: false,

    logLevel: 'warn',
    onboardingUsername: 'welcome',
    recaptcha: {
      enabled: false
    },

    frontendPreferencesLimit: 65536
  }

  config.host = 'http://localhost:' + config.port

  config.application = {
    // Unavailable for registration (reserved for internal use)
    USERNAME_STOP_LIST: [
      '404', 'about', 'account', 'anonymous', 'attachments', 'dev', 'files', 'filter',
      'friends', 'groups', 'help', 'home', 'iphone', 'list', 'logout', 'profilepics',
      'public', 'requests', 'search', 'settings', 'share', 'signin', 'signup', 'summary'
    ],

    // Unavailable for public registration (legacy reasons)
    EXTRA_STOP_LIST: []

    // To load the list from <FREEFEED_HOME>/banlist.txt (one username per line)
    // use the following snippet:
    //
    // var fs = require('fs')
    // var array = fs.readFileSync('banlist.txt').toString()
    //               .split('\n').filter(function(n) { return n != '' })
    // config.application {
    //   EXTRA_STOP_LIST = array
    // }
  }

  config.media = {
    // Public URL prefix
    url: config.host + '/', // must have trailing slash

    // File storage
    storage: {
      // 'fs' for local file system or 's3' for AWS S3
      type: 'fs',

      // Parameters for 'fs'
      rootDir: './public/files/', // must have trailing slash

      // Parameters for 's3'
      accessKeyId: 'ACCESS-KEY-ID',
      secretAccessKey: 'SECRET-ACCESS-KEY',
      bucket: 'bucket-name'
    }
  }
  config.attachments = {
    url: config.media.url,
    storage: config.media.storage,
    path: 'attachments/', // must have trailing slash
    fileSizeLimit: '10mb',
    imageSizes: {
      t: {
        path: 'attachments/thumbnails/', // must have trailing slash
        bounds: { width: 525, height: 175 }
      },
      t2: {
        path: 'attachments/thumbnails2/', // must have trailing slash
        bounds: { width: 1050, height: 350 }
      }
    }
  }
  config.profilePictures = {
    url: config.media.url,
    storage: config.media.storage,
    path: 'profilepics/' // must have trailing slash
  }

  config.mailer = {
    transport: transport,
    fromName: 'Pepyatka',
    fromEmail: 'mail@pepyatka.com',
    resetPasswordMailSubject: 'Pepyatka password reset',
    host: config.origin,
    options: {}
  }

  config.redis = {
    host: 'localhost',
    port: 6379,
    options: {
      retry_max_delay: 2000, //ms
      connect_timeout: 5000, //ms
      max_attempts: 2, //times
    }
  }

  return config
}

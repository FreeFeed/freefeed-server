// Clustering for monitor-dogstats @todo replace in ansible-deploy
process.env.MONITOR_PREFIX = 'development-console'

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
    port: 1337,
    database: 2,

    secret: 'secret',
    origin: 'http://localhost:3333',
    appRoot: '.',
    acceptHashedPasswordsOnly: false,

    logLevel: 'warn',
    recaptcha: {
      enabled: false
    }
  }

  config.host = 'http://localhost:' + config.port

  config.application = {
    // Pepyatka won't allow users to use the following usernames, they
    // are reserved for internal pages.
    //
    // To load this list from <PEPYATKA_HOME>/banlist.txt (one
    // username per line) file use the following snippet:
    //
    // var fs = require('fs')
    // var array = fs.readFileSync('banlist.txt').toString()
    //               .split("\n").filter(function(n) { return n != '' })
    // config.application {
    //   USERNAME_STOP_LIST = array
    // }
    USERNAME_STOP_LIST: ['anonymous', 'public', 'about', 'signin', 'logout',
                         'signup', 'filter', 'settings', 'account', 'groups',
                         'friends', 'list', 'search', 'summary', 'share','404',
                         'iphone', 'attachments', 'files', 'profilepics', 'requests']
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
    fileSizeLimit: '10mb'
  }
  config.thumbnails = {
    url: config.media.url,
    storage: config.media.storage,
    path: 'attachments/thumbnails/' // must have trailing slash
  }
  config.profilePictures = {
    // Profile pictures only support 'fs' for the time being, so we won't use shared values by default
    url: config.host + '/',
    storage: {
      type: 'fs',
      rootDir: config.media.storage.rootDir
    },
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
    options: {}
  }

  return config
}

import fs from 'fs'

import bodyParser from 'body-parser'
import methodOverride from 'method-override'
import morgan from 'morgan'
import passport from 'passport'
import winston from 'winston'
import responseTime from 'response-time'

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
  app.use(responseTime(function (req, res, time) {
    let val = time.toFixed(3) + 'ms'
    res.setHeader('X-Response-Time', val)
    if (!config.disableActionTimingLog) {
      let resource = (req.method + req.url).toLowerCase()
      app.logger.warn(resource, time)
    }
  }))
  return selectEnvironment(app)
}

require("babel-register")({
  ignore: /node_modules/
});

global.Promise = require('bluebird')
global.Promise.onPossiblyUnhandledRejection((e) => { throw e; });

global.Promise.config({
  // Enable warnings.
  warnings: false,
  // Enable long stack traces.
  longStackTraces: true,
  // Enable cancellation.
  cancellation: true
});

global.$redis = require('../config/database')
global.$database = global.$redis.connect()
global.$should = require('chai').should()

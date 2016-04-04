require("babel/register")({
  stage: 1,
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

GLOBAL.$redis = require('../config/database')
  , GLOBAL.$database = $redis.connect()
  , GLOBAL.$should = require('chai').should()
  , GLOBAL.$postgres = require('../config/postgres')
  , GLOBAL.$pg_database = $postgres.connect()

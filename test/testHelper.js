require('babel-register')({ ignore: /node_modules/ });

global.Promise = require('bluebird')
global.Promise.onPossiblyUnhandledRejection((e) => { throw e; });

global.Promise.config({
  // Enable warnings.
  warnings:        false,
  // Enable long stack traces.
  longStackTraces: true,
  // Enable cancellation.
  cancellation:    true
});

global.$database = require('../config/database').default;  // used by realtime-tests

global.$should = require('chai').should()
global.$postgres = require('../config/postgres')
global.$pg_database = global.$postgres.connect()

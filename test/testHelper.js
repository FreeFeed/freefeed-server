const bb = require('bluebird');

bb.onPossiblyUnhandledRejection((e) => {
  throw e;
});

require('babel-runtime/core-js/promise').default = bb;
global.Promise = bb;

require('babel-register')({ ignore: /node_modules/ });

global.$database = require('../config/database').default;  // used by realtime-tests

global.$should = require('chai').should()
global.$postgres = require('../config/postgres')
global.$pg_database = global.$postgres.connect()

const Promise = require('bluebird');

Promise.coroutine.addYieldHandler((value) => Promise.resolve(value));
Promise.onPossiblyUnhandledRejection((e) => {
  throw e;
});

require('babel-register')({ ignore: /node_modules/ });

global.$database = require('../config/database').default;  // used by realtime-tests

global.$should = require('chai').should()
global.$postgres = require('../config/postgres')
global.$pg_database = global.$postgres.connect()

require('babel-runtime/core-js/promise').default = Promise;
global.Promise = Promise;  // this has to be the last one for some reason

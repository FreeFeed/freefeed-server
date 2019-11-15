require('@babel/register');

global.$database = require('../config/database').default;  // used by realtime-tests

global.$should = require('chai').should()
global.$postgres = require('../config/postgres')


global.$pg_database = global.$postgres.connect()

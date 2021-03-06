require('@babel/register')({ extensions: ['.js', '.jsx', '.es6', '.es', '.mjs', '.ts', '.tsx'] });

global.$database = require('../app/setup/database').default; // used by realtime-tests

global.$should = require('chai').should();
global.$postgres = require('../app/setup/postgres');

global.$pg_database = global.$postgres.connect();

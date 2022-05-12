require('esbuild-register/dist/node').register();

global.$database = require('../app/setup/database').default; // used by realtime-tests

global.$should = require('chai').should();
global.$postgres = require('../app/setup/postgres');

global.$pg_database = global.$postgres.connect();

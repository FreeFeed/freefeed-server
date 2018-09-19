#!/usr/bin/env babel-node
import knexLib from 'knex';
import config from '../knexfile';


if (!('test' in config)) {
  process.stderr.write(`Error: no "test" section in knexfile`);
  process.exit(1);
}

const knex = knexLib(config.test);

async function run() {
  await knex.raw('drop schema public cascade');
  await knex.raw('create schema public');
}

run()
  .then(() => {
    knex.destroy();
    process.exit(0);
  })
  .catch((e) => {
    process.stderr.write(`Error: ${e}\n`);
    knex.destroy();
    process.exit(1);
  });

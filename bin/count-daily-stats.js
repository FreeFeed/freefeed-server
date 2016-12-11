#!node_modules/.bin/babel-node
import moment from 'moment';
import bluebird from 'bluebird';
import pgFormat from 'pg-format';

global.Promise = bluebird;
global.Promise.onPossiblyUnhandledRejection((e) => { throw e; });

import { postgres } from '../app/models'

async function get_first_action_date(type) {
  let res;

  if (type === 'users') {
    res = await postgres('users').min('created_at').where('type', 'user');
  } else if (type == 'posts') {
    res = await postgres('posts').min('created_at');
  } else if (type == 'comments') {
    res = await postgres('comments').min('created_at');
  } else {
    throw new Error(`ERROR: unknown entity type: ${type}`);
  }

  return moment(res[0].min).startOf('day');
}

async function get_next_metric_update_date(metric) {
  let data_type;

  switch (metric) {
    case 'users':
    case 'registrations':
    case 'groups':
    case 'groups_creates':
      data_type = 'users';
      break;
    case 'likes':
    case 'likes_creates':
    case 'posts':
    case 'posts_creates':
    case 'active_users':
      data_type = 'posts';
      break;
    case 'comments':
    case 'comments_creates':
      data_type = 'comments';
      break;
    default:
      throw new Error(`ERROR: unknown metric: ${metric}`);
  }

  const res = await postgres('stats').max('dt').where('metric', metric);

  if (res[0].max) {
    return moment(res[0].max).add(1, 'd').startOf('day');
  }

  const date = await get_first_action_date(data_type);

  if (date) {
    return date;
  }

  throw new Error(`ERROR: no data to generate metric: ${metric}`);
}

async function create_metric(metric, to_date, get_metric) {
  process.stdout.write(`Creating stats for ${metric}...\n`);

  let dt;

  dt = await get_next_metric_update_date(metric);

  while (!dt.isAfter(to_date)) {
    const next_date = moment(dt).add(1, 'days');
    const res = await get_metric(dt, next_date);                             // eslint-disable-line babel/no-await-in-loop
    await postgres('stats').insert({ dt, metric, value: res });  // eslint-disable-line babel/no-await-in-loop

    process.stdout.write(`Creating stats for ${metric} for ${dt.format(`YYYY-MM-DD`)}: ${res}\n`);

    dt = next_date;
  }
  process.stdout.write(`Creating stats for ${metric}: done\n\n`);
}

async function main() {
  const to_date = moment().subtract(1, 'd');   // Yesterday

  process.stdout.write(`Creating stats up to: ${to_date.format(`YYYY-MM-DD`)}\n`);

  await create_metric('users', to_date, async (dt, next_date) => {
    const res = await postgres('users').count('id').where('created_at', '<', next_date).andWhere('type', 'user').first();
    return res.count;
  });

  await create_metric('registrations', to_date, async (dt) => {
    const day = dt.format(`YYYY-MM-DD`)

    const sql = pgFormat(`
        select count (distinct id) from users where type = 'user' and date_trunc('day',created_at) = %L`, day);

    const res = await postgres.raw(sql);
    return res.rows[0].count;
  });

  await create_metric('posts', to_date, async (dt, next_date) => {
    const res = await postgres('posts').count('id').where('created_at', '<', next_date).first();
    return res.count;
  });

  await create_metric('posts_creates', to_date, async (dt) => {
    const day = dt.format(`YYYY-MM-DD`)

    const sql = pgFormat(`
        select count (distinct id) from posts where date_trunc('day',created_at) = %L`, day);

    const res = await postgres.raw(sql);
    return res.rows[0].count;
  });

  await create_metric('comments', to_date, async (dt, next_date) => {
    const res = await postgres('comments').count('id').where('created_at', '<', next_date).first();
    return res.count;
  });

  await create_metric('comments_creates', to_date, async (dt) => {
    const day = dt.format(`YYYY-MM-DD`)

    const sql = pgFormat(`
        select count (distinct id) from comments where date_trunc('day',created_at) = %L`, day);

    const res = await postgres.raw(sql);
    return res.rows[0].count;
  });

  await create_metric('likes', to_date, async (dt, next_date) => {
    const res = await postgres('likes').count('id').where('created_at', '<', next_date).first();
    return res.count;
  });

  await create_metric('likes_creates', to_date, async (dt) => {
    const day = dt.format(`YYYY-MM-DD`)

    const sql = pgFormat(`
        select count (distinct id) from likes where date_trunc('day',created_at) = %L`, day);

    const res = await postgres.raw(sql);
    return res.rows[0].count;
  });

  await create_metric('groups', to_date, async (dt, next_date) => {
    const res = await postgres('users').count('id').where('created_at', '<', next_date).andWhere('type', 'group').first();
    return res.count;
  });

  await create_metric('groups_creates', to_date, async (dt) => {
    const day = dt.format(`YYYY-MM-DD`)

    const sql = pgFormat(`
        select count (distinct id) from users where type = 'group' and date_trunc('day',created_at) = %L`, day);

    const res = await postgres.raw(sql);
    return res.rows[0].count;
  });

  await create_metric('active_users', to_date, async (dt) => {
    const day = dt.format(`YYYY-MM-DD`)

    const sql = pgFormat(`
        select count (distinct user_id) from 
          (select distinct (user_id) from posts where date_trunc('day',created_at) = %L
            union select distinct (user_id) from comments where date_trunc('day',created_at) = %L
            union select distinct (user_id) from likes where date_trunc('day',created_at) = %L) as act`,
      day, day, day);

    const res = await postgres.raw(sql);
    return res.rows[0].count;
  });
}

main()
  .then(() => {
    process.stdout.write(`Finished\n`);
    process.exit(0);
  })
  .catch((e) => {
    process.stderr.write(e.message);
    process.exit(1);
  });

import type { Knex } from 'knex';
import pgFormat from 'pg-format';

import { normalizeHashtag } from '../app/support/normalize-hashtags';

export const up = async (knex: Knex) => {
  // Enable pg_trgm extension for LIKE '%pattern%' searches
  await knex.schema.raw(`create extension if not exists pg_trgm`);

  // Add normalized_name column to hashtags
  await knex.schema.raw(`alter table hashtags add column if not exists normalized_name text`);

  // Populate normalized_name for existing hashtags in batches
  {
    const BATCH_SIZE = 100;
    let offset = 0;

    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { rows: hashtags }: { rows: { id: number; name: string }[] } = await knex.raw(
        `select id, name from hashtags order by id limit :limit offset :offset`,
        { limit: BATCH_SIZE, offset },
      );

      if (hashtags.length === 0) {
        break;
      }

      const values = hashtags
        .map(({ id, name }) => pgFormat(`(%L::int, %L)`, id, normalizeHashtag(name)))
        .join(', ');
      // eslint-disable-next-line no-await-in-loop
      await knex.raw(
        `update hashtags set normalized_name = v.normalized_name
       from (values ${values}) as v(id, normalized_name)
       where hashtags.id = v.id`,
      );

      offset += BATCH_SIZE;

      if (hashtags.length < BATCH_SIZE) {
        break;
      }
    }
  }

  // Make normalized_name not null
  await knex.schema.raw(`alter table hashtags alter column normalized_name set not null`);

  // Create trigram index for pattern matching
  await knex.schema.raw(`create index if not exists hashtags_normalized_trgm_idx 
      on hashtags using gin (normalized_name gin_trgm_ops)`);

  // Create materialized view for hashtag statistics
  await knex.schema.raw(`
    create materialized view hashtag_stats as
    select 
      h.id as hashtag_id,
      h.name,
      h.normalized_name,
      count(*) as usage_count,
      bool_or(
        case 
          when hu.type = 'post' then not coalesce(p.is_private, true)
          when hu.type = 'comment' then not coalesce(cp.is_private, true)
          else false
        end
      ) as is_public
    from hashtags h
    join hashtag_usages hu on hu.hashtag_id = h.id
    left join posts p on hu.type = 'post' and hu.entity_id = p.uid
    left join comments c on hu.type = 'comment' and hu.entity_id = c.uid
    left join posts cp on c.post_id = cp.uid
    group by h.id, h.name, h.normalized_name
  `);

  // Create indexes on hashtag_stats
  await knex.schema.raw(`do $$begin
    create unique index hashtag_stats_hashtag_id_idx on hashtag_stats (hashtag_id);
    create index hashtag_stats_normalized_trgm_idx 
      on hashtag_stats using gin (normalized_name gin_trgm_ops);
  end$$`);

  // Create materialized view for hashtag-user relationships
  await knex.schema.raw(`
    create materialized view hashtag_users as
    select distinct
      h.id as hashtag_id,
      case 
        when hu.type = 'post' then p.user_id
        when hu.type = 'comment' then c.user_id
      end as user_id
    from hashtags h
    join hashtag_usages hu on hu.hashtag_id = h.id
    left join posts p on hu.type = 'post' and hu.entity_id = p.uid
    left join comments c on hu.type = 'comment' and hu.entity_id = c.uid
    where 
      case 
        when hu.type = 'post' then p.user_id
        when hu.type = 'comment' then c.user_id
      end is not null
  `);

  // Create indexes on hashtag_users
  await knex.schema.raw(`do $$begin
    create unique index hashtag_users_hashtag_user_idx on hashtag_users (hashtag_id, user_id);
    create index hashtag_users_user_id_idx on hashtag_users (user_id);
  end$$`);
};

export const down = async (knex: Knex) => {
  // Drop materialized views
  await knex.schema.raw(`drop materialized view if exists hashtag_users`);
  await knex.schema.raw(`drop materialized view if exists hashtag_stats`);

  // Drop index
  await knex.schema.raw(`drop index if exists hashtags_normalized_trgm_idx`);

  // Remove added column
  await knex.schema.raw(`alter table hashtags drop column if exists normalized_name`);
};

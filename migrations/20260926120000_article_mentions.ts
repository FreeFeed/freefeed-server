import type { Knex } from 'knex';

import { eventTypesSQLs } from '../app/support/migrations';

const [eventTypesUp, eventTypesDown] = eventTypesSQLs('mention_in_article');

export const up = (knex: Knex) =>
  knex.schema.raw(`do $$begin
    ${eventTypesUp}

    alter table events add column article_id uuid
      references articles (uid) on delete set null on update cascade;

    create unique index events_unique_mention_in_article_idx
      on events (article_id, user_id)
      where event_type = 'mention_in_article';
  end$$`);

export const down = (knex: Knex) =>
  knex.schema.raw(`do $$begin
    drop index events_unique_mention_in_article_idx;
    ${eventTypesDown}
    alter table events drop column article_id;
  end$$`);

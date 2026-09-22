import type { Knex } from 'knex';

export const up = (knex: Knex) =>
  knex.schema.raw(`
        ------------
        -- TABLES --
        ------------
        CREATE TABLE articles (
            uid         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            author_id   uuid NOT NULL,
            post_id     uuid NULL,

            title       text NOT NULL,
            digest      text NOT NULL DEFAULT '',
            body        jsonb NOT NULL,
            version     integer NOT NULL DEFAULT 1,

            created_at  timestamptz NOT NULL DEFAULT now(),
            updated_at  timestamptz NOT NULL DEFAULT now(),

            to_delete   boolean NOT NULL DEFAULT false,

            CONSTRAINT articles_author_fk
                FOREIGN KEY (author_id)
                REFERENCES users(uid),

            CONSTRAINT articles_post_fk
                FOREIGN KEY (post_id)
                REFERENCES posts(uid)
                ON DELETE SET NULL,

            CONSTRAINT articles_version_positive
                CHECK (version > 0)
        );

        CREATE TABLE article_revisions (
            uid         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            article_id  uuid NOT NULL,
            created_at  timestamptz NOT NULL DEFAULT now(),

            title       text NOT NULL,
            digest      text NOT NULL DEFAULT '',
            body        jsonb NOT NULL,
            version     integer NOT NULL,

            CONSTRAINT article_revisions_article_fk
                FOREIGN KEY (article_id)
                REFERENCES articles(uid)
                ON DELETE CASCADE,

            CONSTRAINT article_revisions_version_positive
                CHECK (version > 0),

            CONSTRAINT article_revisions_article_version_unique
                UNIQUE (article_id, version)
        );

        CREATE TABLE article_tags (
            article_id uuid NOT NULL,
            tag_id      bigint NOT NULL,
            ord         integer NOT NULL,

            CONSTRAINT article_tags_pk
                PRIMARY KEY (article_id, tag_id),

            CONSTRAINT article_tags_article_fk
                FOREIGN KEY (article_id)
                REFERENCES articles(uid)
                ON DELETE CASCADE,

            CONSTRAINT article_tags_tag_fk
                FOREIGN KEY (tag_id)
                REFERENCES hashtags(id),

            CONSTRAINT article_tags_ord_nonnegative
                CHECK (ord >= 0)
        );

        CREATE TABLE article_short_ids (
            short_id text PRIMARY KEY,
            long_id uuid UNIQUE
                REFERENCES articles(uid)
                ON UPDATE CASCADE
                ON DELETE SET NULL
        );

        -------------
        -- INDEXES --
        -------------
        CREATE INDEX article_revisions_article_created_idx
            ON article_revisions (article_id, created_at DESC, uid);

        CREATE INDEX articles_author_idx
            ON articles (author_id);

        CREATE INDEX articles_to_delete_idx
            ON articles (to_delete);

        CREATE UNIQUE INDEX articles_post_unique_idx
            ON articles (post_id)
            WHERE post_id IS NOT NULL;

        CREATE INDEX article_tags_tag_idx
            ON article_tags (tag_id, article_id);
    `);

export const down = (knex: Knex) =>
  knex.schema.raw(`
        DROP TABLE IF EXISTS article_short_ids;
        DROP TABLE IF EXISTS article_tags;
        DROP TABLE IF EXISTS article_revisions;
        DROP TABLE IF EXISTS articles;
    `);

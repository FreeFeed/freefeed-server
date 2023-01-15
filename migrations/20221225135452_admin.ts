import type { Knex } from 'knex';

export const up =
  // language=PostgreSQL
  (knex: Knex) =>
    knex.schema.raw(`
      CREATE TABLE admin_roles (
        role text NOT NULL PRIMARY KEY
      );

      -- Initial roles
      INSERT INTO admin_roles (role) VALUES ('administrator'), ('moderator');

      CREATE TABLE admin_users_roles (
        user_id UUID NOT NULL
          REFERENCES users (uid) ON DELETE CASCADE ON UPDATE CASCADE,
        role text NOT NULL
          REFERENCES admin_roles (role) ON DELETE RESTRICT ON UPDATE CASCADE,

        PRIMARY KEY (user_id, role)
      );
      
      CREATE TABLE admin_actions (
        id uuid not null default gen_random_uuid() primary key,
        created_at timestamptz not null default now(),
        admin_username text not null,
        target_username text,
        action_name text not null,
        details jsonb not null default '{}'
          check (jsonb_typeof(details) = 'object')
      );

      CREATE FUNCTION admin_actions_abort_tf() RETURNS TRIGGER LANGUAGE plpgsql AS
      $$
      begin
          return null;
      end;
      $$;

      CREATE TRIGGER no_update_or_delete_t
          BEFORE UPDATE OR DELETE ON admin_actions
          FOR EACH ROW EXECUTE FUNCTION admin_actions_abort_tf();
`);

export const down = (knex: Knex) =>
  // language=PostgreSQL
  knex.schema.raw(`
    DROP TRIGGER no_update_or_delete_t ON admin_actions;
    DROP FUNCTION admin_actions_abort_tf;
    DROP TABLE admin_actions;
    DROP TABLE admin_users_roles;
    DROP TABLE admin_roles;
 `);

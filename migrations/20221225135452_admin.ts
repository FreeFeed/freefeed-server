import type Knex from 'knex';

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
      
      CREATE TABLE administrators_actions (
        id SERIAL NOT NULL PRIMARY KEY,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        username TEXT NOT NULL,
        action_name TEXT NOT NULL,
        details JSONB
      );

      CREATE FUNCTION administrators_actions_abort_tf() RETURNS TRIGGER LANGUAGE plpgsql AS
      $$
      begin
          return null;
      end;
      $$;

      CREATE TRIGGER no_update_or_delete_t
          BEFORE UPDATE OR DELETE ON administrators_actions
          FOR EACH ROW EXECUTE FUNCTION administrators_actions_abort_tf();
`);

export const down = (knex: Knex) =>
  // language=PostgreSQL
  knex.schema.raw(`
    DROP TRIGGER no_update_or_delete_t ON administrators_actions;
    DROP FUNCTION administrators_actions_abort_tf;
    DROP TABLE administrators_actions;
    DROP TABLE administrators_roles_links;
    DROP TABLE administrators_roles;
    DROP TABLE administrators;
  `);

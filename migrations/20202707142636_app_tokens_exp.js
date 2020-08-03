export const up = (knex) => knex.schema.raw(`do $$begin
  -- expires_at is null for persistent tokens. We don't use 'infinity' here
  -- for better JS interoperability.
  alter table app_tokens add column expires_at timestamptz;

  -- activation_code can be null for the earlier generated tokens. Codes are
  -- not necessary unique.
  alter table app_tokens add column activation_code text;

  create index app_tokens_is_active_idx on app_tokens using btree (is_active);
  create index app_tokens_expires_at_idx on app_tokens using btree (expires_at);
  create index app_tokens_activation_code_idx on app_tokens using btree (activation_code);
end$$`);

export const down = (knex) => knex.schema.raw(`do $$begin
  alter table app_tokens drop column expires_at;
end$$`);

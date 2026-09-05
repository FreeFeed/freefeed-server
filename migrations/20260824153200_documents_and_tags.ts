import { type Knex } from 'knex';

export async function up(knex: Knex) {
  await knex.schema.createTable('documents', (table) => {
    table.increments().notNullable().primary();
    table.uuid('uid').defaultTo(knex.raw('gen_random_uuid()')).notNullable().unique();
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();
    table
      .uuid('user_id')
      .notNullable()
      .references('uid')
      .inTable('users')
      .onUpdate('cascade')
      .onDelete('cascade');
    table.text('title').notNullable().defaultTo('');
    table.text('slug').notNullable().defaultTo('');
    table.text('body').notNullable().defaultTo('');
    table
      .uuid('parent_id')
      .references('uid')
      .inTable('documents')
      .onUpdate('cascade')
      .onDelete('set null');
    table.boolean('is_published').notNullable().defaultTo(true);
    table.text('visibility').notNullable().defaultTo('public');

    table.index('user_id', 'documents_user_id_idx', 'btree');
    table.index('parent_id', 'documents_parent_id_idx', 'btree');
  });

  // Check constraint for visibility — Knex has no builder for CHECK
  await knex.schema.raw(
    `alter table documents add constraint documents_visibility_check
     check (visibility in ('public', 'protected', 'private'))`,
  );

  // Partial unique index — Knex doesn't support WHERE clause on indexes
  await knex.schema.raw(
    `create unique index documents_user_slug_idx on documents (user_id, slug) where slug <> ''`,
  );

  await knex.schema.createTable('document_tags', (table) => {
    table
      .uuid('document_id')
      .notNullable()
      .references('uid')
      .inTable('documents')
      .onUpdate('cascade')
      .onDelete('cascade');
    table.text('tag').notNullable();
    table.primary(['document_id', 'tag']);
    table.index('tag', 'document_tags_tag_idx', 'btree');
  });

  // Auto-update updated_at on document change (Knex has no builder for triggers)
  await knex.schema.raw(`
    create function trg_documents_updated_at() returns trigger as
    $BODY$
    begin
      new.updated_at = now();
      return new;
    end;
    $BODY$
    language plpgsql;
  `);

  await knex.schema.raw(
    `create trigger trg_documents_updated_at
     before update on documents
     for each row execute function trg_documents_updated_at()`,
  );
}

export async function down(knex: Knex) {
  await knex.schema.raw('drop trigger if exists trg_documents_updated_at on documents');
  await knex.schema.raw('drop function if exists trg_documents_updated_at()');
  await knex.schema.dropTableIfExists('document_tags');
  await knex.schema.dropTableIfExists('documents');
}
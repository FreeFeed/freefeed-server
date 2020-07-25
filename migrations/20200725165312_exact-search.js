/**
 * The to_tsvector_with_exact function calculates the standard (stemmed)
 * tsvector and the vector with the exact wordforms. These vectors mixed so that
 * the stemmed and exact words are shared the same positions:
 *
 * '=fox':1 '=jumps':2 '=over':3 'fox':1 'jump':2
 */

export const up = (knex) => knex.schema.raw(`do $$begin
  create function to_tsvector_with_exact(cfg regconfig, str text)
    returns tsvector
    language 'sql'
  AS $BODY$
    select array_to_string(array_cat(
      -- Standard to_tsvector with cfg
      string_to_array(to_tsvector(cfg, str)::text, ' '),
      -- Exact wordorms with 'simple' configuration and '=' prefixes
      -- The result is like '=dog':4 '=fox':1 '=jumps':2 '=over':3
      string_to_array(
        regexp_replace(to_tsvector('simple', str)::text, '''([^:])', '''=\\1', 'g'), ' ')
    ), ' ')::tsvector;
  $BODY$;
end$$`);

export const down = (knex) => knex.schema.raw(`do $$begin
  drop function to_tsvector_with_exact(cfg regconfig, str text);
end$$`);

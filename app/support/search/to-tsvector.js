import pgFormat from 'pg-format';
import { HashTag, Mention, Link } from 'social-text-tokenizer';
import config from 'config';

import { tokenize } from '../tokenize-text';

import { normalizeText, linkToText } from './norm';


const ftsCfg = config.postgres.textSearchConfigName;

// Prepares post/comment text for indexing
export function toTSVector(text) {
  const vectors = tokenize(normalizeText(text || '')).map((token) => {
    if (token instanceof HashTag || token instanceof Mention) {
      // Mentions and hashtags should be found by exact @-query or by regular word query
      const exactText =
        token instanceof HashTag ? token.text.replace(/[_-]/g, '') : token.text;
      return pgFormat(
        `(to_tsvector(%L, %L)::text || ' ' || %L)::tsvector`,
        ftsCfg,
        token.text.replace(/[_-]+/g, ' '),
        `'${exactText}':1`
      );
    } else if (token instanceof Link) {
      return pgFormat(`to_tsvector(%L, %L)`, ftsCfg, linkToText(token));
    }

    return pgFormat('to_tsvector(%L, %L)', ftsCfg, token.text);
  });

  return vectors.length > 0 ? `(${vectors.join('||')})` : `to_tsvector('')`;
}

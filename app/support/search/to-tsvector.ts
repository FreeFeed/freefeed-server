import pgFormat from 'pg-format';
import { HashTag, Mention, Link } from 'social-text-tokenizer';
import config from 'config';

import { tokenize } from '../tokenize-text';

import { normalizeText, linkToText } from './norm';

const ftsCfg = config.postgres.textSearchConfigName;

// Prepares post/comment text for indexing
export function toTSVector(text: string) {
  const vectors = tokenize(normalizeText(text || ''))
    .map((token) => {
      if (token instanceof HashTag || token instanceof Mention) {
        // Mentions and hashtags should be found by exact @/#-query or by regular word query
        const exactText =
          token instanceof HashTag
            ? token.text.replace(/[_-]/g, '') // join parts of hashtag to ignore separators
            : token.text;
        return pgFormat(
          `(to_tsvector_with_exact(%L, %L)::text || ' ' || %L)::tsvector`,
          ftsCfg,
          token.text.substring(1).replace(/[_-]+/g, ' '), // convert separated text to phrase
          `'${exactText}':1`,
        );
      }

      if (token instanceof Link) {
        return pgFormat(`to_tsvector_with_exact(%L, %L)`, ftsCfg, linkToText(token));
      }

      const trimmedText = token.text.trim();
      return trimmedText && pgFormat('to_tsvector_with_exact(%L, %L)', ftsCfg, trimmedText);
    })
    .filter(Boolean);

  if (vectors.length === 0) {
    return `''::tsvector`;
  } else if (vectors.length === 1) {
    return vectors[0];
  }

  return `(${vectors.join(' || ')})`;
}

import pgFormat from 'pg-format';
import { HashTag, Mention, Link } from 'social-text-tokenizer';
import config from 'config';

import { HTMLTag, tokenize, UUIDString } from '../tokenize-text';
import { extractUUIDs } from '../backlinks';

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
        // UUIDs in URL
        const uuidVectors = extractUUIDs(normalizeText(token.pretty)).map((u, i) =>
          pgFormat('%L::tsvector', `'${u.toLowerCase()}':${i + 1}`),
        );
        const textVector = pgFormat(`to_tsvector_with_exact(%L, %L)`, ftsCfg, linkToText(token));

        if (uuidVectors.length === 0) {
          return textVector;
        }

        return `(${[textVector, ...uuidVectors].join(" || ' ' || ")})::tsvector`;
      }

      if (token instanceof HTMLTag) {
        return token.content && pgFormat('to_tsvector_with_exact(%L, %L)', ftsCfg, token.content);
      }

      if (token instanceof UUIDString) {
        return pgFormat('%L::tsvector', `'${token.text.toLowerCase()}':1`);
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

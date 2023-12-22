import pgFormat from 'pg-format';
import config from 'config';
import { HASHTAG, LINK, MENTION } from 'social-text-tokenizer';
import { prettyLink } from 'social-text-tokenizer/prettifiers';

import { HTML_TAG_TOKEN, UUID_TOKEN, htmlTagContent, tokenize } from '../tokenize-text';
import { extractUUIDs } from '../backlinks';

import { normalizeText, linkToText } from './norm';

const ftsCfg = config.postgres.textSearchConfigName;

// Prepares post/comment text for indexing
export function toTSVector(text: string) {
  const vectors = tokenize(normalizeText(text || ''))
    .map((token) => {
      if (token.type === HASHTAG || token.type === MENTION) {
        // Mentions and hashtags should be found by exact @/#-query or by regular word query
        const exactText =
          token.type === HASHTAG
            ? token.text.replace(/[_-]/g, '') // join parts of hashtag to ignore separators
            : token.text;
        return pgFormat(
          `(to_tsvector_with_exact(%L, %L)::text || ' ' || %L)::tsvector`,
          ftsCfg,
          token.text.substring(1).replace(/[_-]+/g, ' '), // convert separated text to phrase
          `'${exactText}':1`,
        );
      }

      if (token.type === LINK) {
        // UUIDs in URL
        const uuidVectors = extractUUIDs(normalizeText(prettyLink(token.text))).map((u, i) =>
          pgFormat('%L::tsvector', `'${u.toLowerCase()}':${i + 1}`),
        );
        const textVector = pgFormat(
          `to_tsvector_with_exact(%L, %L)`,
          ftsCfg,
          linkToText(token.text),
        );

        if (uuidVectors.length === 0) {
          return textVector;
        }

        return `(${[textVector, ...uuidVectors].join(" || ' ' || ")})::tsvector`;
      }

      if (token.type === HTML_TAG_TOKEN) {
        const content = htmlTagContent(token.text);
        return content && pgFormat('to_tsvector_with_exact(%L, %L)', ftsCfg, content);
      }

      if (token.type === UUID_TOKEN) {
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

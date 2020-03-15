import pgFormat from 'pg-format';
import { HashTag, Mention, Link } from 'social-text-tokenizer';

import { tokenize } from '../tokenize-text';

import { normalizeText, linkToText } from './norm';

// Prepares post/comment text for indexing
export function toTSVector(text) {
  const vectors = tokenize(normalizeText(text)).map((token) => {
    if (token instanceof HashTag || token instanceof Mention) {
      // Mentions and hashtags should be found by exact @-query or by regular word query
      return pgFormat(`(to_tsvector(%L)::text || ' ' || %L)::tsvector`, token.text, `'${token.text}':1`);
    } else if (token instanceof Link) {
      return pgFormat(`to_tsvector(%L)`, linkToText(token));
    }

    return pgFormat('to_tsvector(%L)', token.text);
  });

  return `(${vectors.join('||')})`;
}

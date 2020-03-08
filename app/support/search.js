import XRegExp from 'xregexp';
import { HashTag, Mention, Link } from 'social-text-tokenizer';
import pgFormat from 'pg-format';

import { tokenize } from './tokenize-text';

/**
 * Generate tsquery SQL query from the search request.
 * @param {object[]} terms
 * @returns {string}
 */
export function termsToTSQuery(terms) {
  const parts = terms
    .filter((term) => !term.scope)
    .map((term) => {
      const prefix = term.exclude ? '!!' : '';

      if (term.quoted) {
        const queries = tokenize(term.text).map((token) => {
          if (token instanceof HashTag || token instanceof Mention) {
            return pgFormat(`%L::tsquery`, token.text);
          } else if (token instanceof Link) {
            return pgFormat('phraseto_tsquery(%L)', linkToText(token));
          }

          return pgFormat('phraseto_tsquery(%L)', token.text);
        });
        return `${prefix}(${queries.join('<->')})`;
      } else if (/^[#@]/.test(term.text)) {
        return prefix + pgFormat(`%L::tsquery`, term.text);
      }

      const [firstToken] = tokenize(term.text);

      if (firstToken instanceof Link) {
        return prefix + pgFormat('phraseto_tsquery(%L)', linkToText(firstToken));
      }

      return prefix + pgFormat(`plainto_tsquery(%L)`, term.text);
    });

  return parts.join(' && ');
}

/**
 * Prepare text for indexing. Returns SQL expressin that forms the tsvector.
 *
 * @param {string} text
 * @returns {string}
 */
export function textToTSVector(text) {
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

/**
 * This function parses a very simple format of search query. The query consists of
 * terms which are \S+ strings or double quotes JSON-like strings, optionally prepended
 * with scope operator (e.g. "in:", "from:") and the minus sign for the negation of
 * whole term. Some examples: `aaa bbb`, `aaa -bbb`, `aaa -from:bbb`...
 *
 * @param {string} query search query
 * @param {string[]} knownScopes list of predefined scopes
 */
export function parseQuery(query, knownScopes = []) {
  const terms = [];
  let match;

  while ((match = termRe.exec(normalizeText(query))) !== null) {
    const [, exclude, positive, scope, qstring, string] = match;

    const term = {
      exclude: !!exclude,
      scope:   knownScopes.includes(scope) ? scope : null,
      quoted:  !!qstring,
      text:    ''
    };

    if (scope && term.scope === null) {
      term.text = positive; // just pass as-is
    } else if (qstring !== undefined) {
      try {
        term.text = JSON.parse(qstring);
      } catch (e) {
        term.text = qstring;
      }
    } else if (string !== undefined) {
      term.text = string;
    }

    if (!term.quoted) {
      if (/^[#@]/.test(term.text)) {
        term.text = term.text.replace(trimTextRightRe, '$1');
      } else {
        term.text = term.text.replace(trimTextRe, '$1');
      }
    }

    if (term.text.length !== 0) {
      terms.push(term);
    }
  }

  return terms;
}

/**
 * Prepare text for search:
 * 1. Normalize to NFKD Unicode form
 * 2. Remove any Unicode Mark symbols
 * 3. Normalize to NFC Unicode form
 * 4. Convert to lower case
 *
 * As a result, the 'Pražského povstání' string becomes 'prazskeho povstani'.
 * It isn't a complete solution (keeps ligatures ß, æ and some other joined)
 * but can handle most of european diactrics.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalizeText(text) {
  return (
    text
      // The "'" has a special meaning in Postgres literals and has no
      // meaning in search context. Remove them for simplicity.
      .replace("'", ' ')
      .normalize('NFKD')
      // Preserve cyrillic 'short i' (convert it back to NFC)
      .replace('\u0418\u0306', '\u0419')
      .replace('\u0438\u0306', '\u0439')
      .replace(marksCharsRe, '')
      .normalize('NFC')
      .toLowerCase()
  );
}

/**
 * @param {Link} link
 * @returns {string}
 */
export function linkToText(link) {
  return normalizeText(link.pretty)
    .replace(notAlNum, ' ')
    .replace(/^www /, '');
}

const marksCharsRe = new XRegExp(`[\\pM]`, 'g');
const notAlNum = new XRegExp(`[^\\pL\\pN]+`, 'g');

// -?(scope:)?(double-quoted-string|string)
const termRe = /(-?)((?:(?:(\S+?):)?(?:("(?:[^"\\]|\\.)*")|(\S+))))/g;

// A simple trimmer, trims punctuation, separators and some symbols.
const trimTextRe = new XRegExp(`^[\\pP\\pZ\\pC\\pS]*(.*?)[\\pP\\pZ\\pC\\pS]*$`, 'u');
const trimTextRightRe = new XRegExp(`^(.*?)[\\pP\\pZ\\pC\\pS]*$`, 'u');

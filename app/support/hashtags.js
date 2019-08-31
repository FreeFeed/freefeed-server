import { uniq } from 'lodash';
import { HashTag } from 'social-text-tokenizer';

import { tokenize } from './tokenize-text';

/**
 * Extract all unique hashtags as strings from the given text
 * @param {string} text
 * @return {string[]}
 */
export function extractHashtags(text) {
  if (typeof text !== 'string' || text === '' || text.indexOf('#') < 0) {
    return [];
  }

  return uniq(
    tokenize(text)
      .filter((t) => t instanceof HashTag)
      .map((t) => t.text.substr(1))
  );
}

import { uniq } from 'lodash';
import { HASHTAG } from 'social-text-tokenizer';

import { tokenize } from './tokenize-text';

/**
 * Extract all unique hashtags as strings from the given text
 */
export function extractHashtags(text: string) {
  if (typeof text !== 'string' || text === '' || text.indexOf('#') < 0) {
    return [];
  }

  return uniq(
    tokenize(text)
      .filter((t) => t.type === HASHTAG)
      .map((t) => t.text.substring(1)),
  );
}

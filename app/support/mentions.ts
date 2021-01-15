import { Mention } from 'social-text-tokenizer';

import { tokenize } from './tokenize-text';

/**
 * Extract all mentions with their start offsets from the given text
 */
export function extractMentionsWithOffsets(text: string) {
  if (typeof text !== 'string' || text === '' || text.indexOf('@') < 0) {
    return [];
  }

  return (
    tokenize(text)
      // Valid usernames are from 3 to 25 chars plus '@'
      .filter((t) => t instanceof Mention && t.text.length >= 4 && t.text.length <= 26)
      .map((t) => ({ username: t.text.substring(1).toLowerCase(), offset: t.offset }))
  );
}

/**
 * Extract all mentions as strings from the given text
 */
export function extractMentions(text: string) {
  return extractMentionsWithOffsets(text).map((m) => m.username);
}

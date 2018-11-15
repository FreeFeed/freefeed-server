import _ from 'lodash';
import URLFinder from 'ff-url-finder';


const finder = new URLFinder();

/**
 * Extract all mentions with their start and end indices
 * from the given text
 * @param {string} text
 * @return {{username: string, indices: number[]}[]}
 */
export function extractMentionsWithIndices(text) {
  if (typeof text !== 'string' || text === '') {
    return [];
  }

  const parsed = finder.parse(text);
  const mentions = [];
  let pos = 0;

  for (const p of parsed) {
    if (p.type === 'atLink' && p.username.length >= 3 && p.username.length <= 25) {
      mentions.push({
        username: p.username.toLowerCase(),
        indices:  [pos, pos + p.text.length],
      });
    }

    pos += p.text.length;
  }

  return mentions;
}

/**
 * Extract all mentions as strings from the given text
 * @param {string} text
 * @return {string[]}
 */
export function extractMentions(text) {
  const mentions = extractMentionsWithIndices(text);
  return _.map(mentions, 'username');
}


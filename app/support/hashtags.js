import _ from 'lodash';
import URLFinder from 'ff-url-finder';

const finder = new URLFinder();
finder.withHashTags = true;

/**
 * Extract all hashtags with their start and end indices
 * from the given text
 * @param {string} text
 * @return {{hashtag: string, indices: number[]}[]}
 */
export function extractHashtagsWithIndices(text) {
  if (typeof text !== 'string' || text === '') {
    return [];
  }
  const parsed = finder.parse(text);
  const hashtags = [];
  let pos = 0;
  for (const p of parsed) {
    if (p.type === 'hashTag') {
      hashtags.push({
        hashtag: p.hashTag,
        indices: [pos, pos + p.text.length],
      });
    }
    pos += p.text.length
  }
  return hashtags;
}

/**
 * Extract all hashtags as strings from the given text
 * @param {string} text
 * @return {string[]}
 */
export function extractHashtags(text) {
  const hashtags = extractHashtagsWithIndices(text);
  return _.map(hashtags, 'hashtag');
}


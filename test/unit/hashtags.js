/* eslint-env node, mocha */
import _ from 'lodash';
import expect from 'unexpected';

import { extractHashtags, extractHashtagsWithIndices } from '../../app/support/hashtags';

describe('Hashtags parser', () => {
  const cases = [
    { text: 'abc #def #ee gh', result: [{ hashtag: 'def', indices: [4, 8] }, { hashtag: 'ee', indices: [9, 12] }] },
    { text: '#abc', result: [{ hashtag: 'abc', indices: [0, 4] }] },
    { text: '#a-c', result: [{ hashtag: 'a-c', indices: [0, 4] }] },
    { text: '#a--c', result: [{ hashtag: 'a', indices: [0, 2] }] },
  ];

  cases.forEach(({ text, result }) => {
    it(`should parse "${text}"`, () => {
      expect(extractHashtagsWithIndices(text), 'to equal', result);
      expect(extractHashtags(text), 'to equal', _.map(result, 'hashtag'));
    });
  });
});



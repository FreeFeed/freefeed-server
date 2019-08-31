/* eslint-env node, mocha */
import expect from 'unexpected';

import { extractHashtags } from '../../../app/support/hashtags';


describe('Hashtags parser', () => {
  const cases = [
    { text: 'abc #def #ee gh', result: ['def', 'ee'] },
    { text: '#abc', result: ['abc'] },
    { text: '#a-c', result: ['a-c'] },
    { text: '#a--c', result: [] },
  ];

  cases.forEach(({ text, result }) => {
    it(`should parse "${text}"`, () => {
      expect(extractHashtags(text), 'to equal', result);
    });
  });
});



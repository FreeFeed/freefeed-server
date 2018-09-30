/* eslint-env node, mocha */
import expect from 'unexpected'

import { extractTitle } from '../../app/support/rss-text-parser';

describe('extractTitle function', () => {
  const maxLen = 35;

  const testData = [
    [
      'should return the first line of text',
      'Tiger, tiger, burning bright\nIn the forests of the night',
      'Tiger, tiger, burning bright',
    ],
    [
      'should return the first sentence of long line',
      'Tiger, tiger, burning bright. In the forests of the night',
      'Tiger, tiger, burning bright.',
    ],
    [
      'should split a long sentence',
      'Tiger, tiger, burning bright In the forests of the night, What immortal hand or eye Could frame thy fearful symmetry?',
      'Tiger, tiger, burning bright In the\u2026',
    ],
    [
      'should cut a long word',
      'TigertigerburningbrightIntheforestsofthenight',
      'TigertigerburningbrightIntheforest\u2026',
    ],
  ];

  for (const [title, text, result] of testData) {
    it(title, () => expect(extractTitle(text, maxLen), 'to be', result));
  }
});

/* eslint-env node, mocha */
import expect from 'unexpected';
import { Link } from 'social-text-tokenizer';

import { linkToText, normalizeText } from '../../../../app/support/search/norm';


describe('search:normalizeText', () => {
  const tests = [
    { input: 'abcd', output: 'abcd' },
    { input: 'řádek', output: 'radek' },
    { input: 'Ёлка, ёжик и йод', output: 'елка, ежик и йод' },
  ];

  for (const { input, output } of tests) {
    it(`should normalize a ${JSON.stringify(input)}`, () => {
      expect(normalizeText(input), 'to equal', output);
    });
  }
});


describe('search:linkToText', () => {
  const tests = [
    { input: 'adobe.com', output: 'adobe com' },
    { input: 'www.adobe.com', output: 'adobe com' },
    { input: 'https://github.com/FreeFeed/freefeed-server', output: 'github com freefeed freefeed server' },
    {
      input:  'https://es.wikipedia.org/wiki/Ma%C3%B1ana',
      output: 'es wikipedia org wiki manana'
    },
  ];

  for (const { input, output } of tests) {
    it(`should convert a ${JSON.stringify(input)}`, () => {
      expect(linkToText(new Link(0, input)), 'to equal', output);
    });
  }
});

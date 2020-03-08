/* eslint-env node, mocha */
import expect from 'unexpected'
import { Link } from 'social-text-tokenizer';

import { parseQuery, normalizeText, linkToText } from '../../../app/support/search';


describe('parseQuery', () => {
  const term = (o) => ({ exclude: false, scope: null, quoted: false, text: '', ...o });
  const knownScopes = ['in'];

  it('should parse simple text', () => {
    expect(parseQuery('mm rotoscoping'), 'to equal', [
      term({ text: 'mm' }),
      term({ text: 'rotoscoping' }),
    ]);
  });

  it('should parse text with exclude', () => {
    expect(parseQuery('mm -rotoscoping'), 'to equal', [
      term({ text: 'mm' }),
      term({ text: 'rotoscoping', exclude: true }),
    ]);
  });

  it('should parse text with scopes', () => {
    expect(parseQuery('in:space we:trust', knownScopes), 'to equal', [
      term({ text: 'space', scope: 'in' }),
      term({ text: 'we:trust' }),
    ]);
  });

  it('should parse text with quotes', () => {
    expect(parseQuery('in:space "we \\"trust\\""', knownScopes), 'to equal', [
      term({ text: 'space', scope: 'in' }),
      term({ text: 'we "trust"', quoted: true }),
    ]);
  });

  it('should parse text with quotes, scopes and exclude flag', () => {
    expect(parseQuery('-in:"space & time"', knownScopes), 'to equal', [
      term({ text: 'space & time', scope: 'in', exclude: true, quoted: true }),
    ]);
  });

  it('should parse text with punctuation', () => {
    expect(parseQuery('cat, bat = rat\u2026'), 'to equal', [
      term({ text: 'cat' }),
      term({ text: 'bat' }),
      term({ text: 'rat' }),
    ]);
  });
});

describe('normalizeText', () => {
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


describe('linkToText', () => {
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

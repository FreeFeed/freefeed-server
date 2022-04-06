/* eslint-env node, mocha */
import expect from 'unexpected';

import { deepMergeJSON } from '../../app/support/deep-merge';

describe('deepMergeJSON', () => {
  const testData = [
    { base: 42, patch: 43, result: 43 },
    { base: null, patch: 43, result: 43 },
    { base: 'null', patch: 43, result: 'null' },
    { base: { foo: 'bar' }, patch: undefined, result: { foo: 'bar' } },
    {
      base: { a: 41, b: [], c: null },
      patch: { b: [1, 2, 3] },
      result: { a: 41, b: [1, 2, 3], c: null },
    },
    {
      base: { a: 41, b: [], c: '33' },
      patch: { a: [], b: [1, 2, 3], c: null },
      result: { a: 41, b: [1, 2, 3], c: '33' },
    },
  ];

  for (const { base, patch, result } of testData) {
    it(`should merge ${JSON.stringify(base)} and ${JSON.stringify(patch)}`, () =>
      expect(deepMergeJSON(base, patch), 'to equal', result));
  }
});

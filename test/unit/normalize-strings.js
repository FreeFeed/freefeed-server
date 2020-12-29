/* eslint-env node, mocha */
import expect from 'unexpected';

import { normalizeStrings } from '../../app/controllers/middlewares/normalize-input';

const tests = [
  { input: 42, output: 42 },
  { input: 'abcd', output: 'abcd' },
  { input: 'řádek'.normalize('NFD'), output: 'řádek'.normalize('NFC') },
  {
    input: { deep: { prop: 'řádek'.normalize('NFD') } },
    output: { deep: { prop: 'řádek'.normalize('NFC') } },
  },
  {
    input: { deep: [42, 'řádek'.normalize('NFD')] },
    output: { deep: [42, 'řádek'.normalize('NFC')] },
  },
  {
    input: { ['klíč'.normalize('NFD')]: 'veličina'.normalize('NFD') },
    output: { ['klíč'.normalize('NFC')]: 'veličina'.normalize('NFC') },
  },
];

describe('normalizeStrings', () => {
  for (const { input, output } of tests) {
    it(`should normalize a ${JSON.stringify(input)}`, () => {
      expect(normalizeStrings(input), 'to equal', output);
    });
  }
});

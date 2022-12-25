/* eslint-env node, mocha */
import expect from 'unexpected';

import { isBlockedEmailDomain, normalizeEmail } from '../../../app/support/email-norm';

describe('normalizeEmail', () => {
  const testData: { input: string; result: string }[] = [
    { input: 'foo-bar', result: 'foo-bar' },
    { input: 'foo@bar', result: 'foo@bar' },
    { input: 'FoO@bAr', result: 'foo@bar' },
    { input: 'FoO.foo@bAr', result: 'foofoo@bar' },
    { input: 'FoO.foo.baZ@bAr', result: 'foofoobaz@bar' },
    { input: 'FoO.foo+alias@bAr', result: 'foofoo@bar' },
    { input: 'FoO.foo+alias+alias2@bAr', result: 'foofoo@bar' },
  ];

  for (const t of testData) {
    it(`should normalize "${t.input}" to "${t.result}"`, () =>
      expect(normalizeEmail(t.input), 'to be', t.result));
  }
});

describe('isBlockedEmailDomain', () => {
  // See test/emailDomainBlockList.txt for the block list
  const testData: { input: string; result: boolean }[] = [
    { input: 'foo@BAD.com', result: true },
    { input: 'foo@verybad.com', result: false },
    { input: 'foo@very.bad.com', result: true },
    { input: 'foo@a.b.c', result: true },
    { input: 'foo@a.b.c.d', result: false },
    { input: 'foo@d.a.b.c', result: true },
  ];

  for (const t of testData) {
    it(`should identify "${t.input}" as ${t.result ? '' : 'not '}disposable`, () =>
      expect(isBlockedEmailDomain(t.input), 'to be', t.result));
  }
});

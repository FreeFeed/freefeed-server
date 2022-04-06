/* eslint-env node, mocha */
import expect from 'unexpected';

import { defaultPrefs } from '../../app/models/user-prefs';

describe('User preferences manipulations', () => {
  const defValues = { foo: 1, bar: 'baz' };

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  it(`should return the second argument untouched`, () => {
    const newValues = defaultPrefs(new Date(), defValues, {});
    expect(newValues, 'to be', defValues);
  });

  describe('createdSince', () => {
    it(`should update preferences for new account`, () => {
      const newValues = defaultPrefs(today, defValues, {
        foo: { createdSince: yesterday.toISOString().substring(0, 10), value: 2 },
      });
      expect(newValues, 'to equal', { ...defValues, foo: 2 });
    });

    it(`should not update preferences for old account`, () => {
      const newValues = defaultPrefs(yesterday, defValues, {
        foo: { createdSince: today.toISOString().substring(0, 10), value: 2 },
      });
      expect(newValues, 'to be', defValues);
    });
  });

  describe('createdBefore', () => {
    it(`should not update preferences for new account`, () => {
      const newValues = defaultPrefs(today, defValues, {
        foo: { createdBefore: yesterday.toISOString().substring(0, 10), value: 2 },
      });
      expect(newValues, 'to be', defValues);
    });

    it(`should update preferences for old account`, () => {
      const newValues = defaultPrefs(yesterday, defValues, {
        foo: { createdBefore: today.toISOString().substring(0, 10), value: 2 },
      });
      expect(newValues, 'to equal', { ...defValues, foo: 2 });
    });
  });
});

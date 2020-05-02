/* eslint-env node, mocha */
import expect from 'unexpected';

import { toTSVector } from '../../../../app/support/search/to-tsvector';

/**
 * It is not a full test but just test of some corner cases
 */
describe('toTSVector', () => {
  it('should return empty vector of empty string', () => {
    expect(toTSVector(''), 'to be', `to_tsvector('')`);
  });

  it('should return empty vector of string of unsupported characters', () => {
    expect(toTSVector('\u0652'), 'to be', `to_tsvector('')`);
  });
});

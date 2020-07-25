/* eslint-env node, mocha */
import expect from 'unexpected';
import config from 'config';

import { toTSVector } from '../../../../app/support/search/to-tsvector';


const ftsCfg = config.postgres.textSearchConfigName;

describe('toTSVector', () => {
  it('should return empty vector of empty string', () => {
    expect(toTSVector(''), 'to be', `''::tsvector`);
  });

  it('should return empty vector of string of unsupported characters', () => {
    expect(toTSVector('\u0652'), 'to be', `''::tsvector`);
  });

  it('should return vector of regular text', () => {
    const string = 'the quick brown fox jumped over the lazy dog';
    expect(toTSVector(string), 'to be', `to_tsvector_with_exact('${ftsCfg}', '${string}')`);
  });

  it('should return vector of text with mentions and hashtags', () => {
    const string = 'the quick brown @fox-jump #lazy-dog';
    expect(
      toTSVector(string), 'to be',
      `(`
      + `to_tsvector_with_exact('${ftsCfg}', 'the quick brown') || `
      + `(`
        + `to_tsvector_with_exact('${ftsCfg}', 'fox jump')::text || ' ' || `
        + `'''@fox-jump'':1'`
      + `)::tsvector || `
      + `(`
        + `to_tsvector_with_exact('${ftsCfg}', 'lazy dog')::text || ' ' || `
        + `'''#lazydog'':1'`
      + `)::tsvector`
      + `)`
    );
  });

  it('should return vector of text with links', () => {
    const string = 'the quick brown www.foxnews.com';
    expect(
      toTSVector(string), 'to be',
      `(`
      + `to_tsvector_with_exact('${ftsCfg}', 'the quick brown') || `
      + `to_tsvector_with_exact('${ftsCfg}', 'foxnews com')`
      + `)`
    );
  });
});

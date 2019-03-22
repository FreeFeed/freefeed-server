/* eslint-env node, mocha */
/* eslint babel/semi: "error" */
import expect from 'unexpected';
import { forEach } from 'lodash';

import { SearchQueryParser } from '../../../app/support/SearchQueryParser';

/**
 * Based on friendfeed.com search spec:
 * https://docs.google.com/document/d/1vUydseCSgYgr8-imvD5JWA-R3xcegLS982qyBCMCNAk/edit?pref=2&pli=1#heading=h.32mljutrf1uz
 */
describe('SearchQueryParser', () => {
  describe('anonymous context', () => {
    const expectations = {
      'test':                                { query: 'test' },
      'foo -bar':                            { query: 'foo & !bar' },
      '-foo bar':                            { query: '!foo & bar' },
      'foo-bar':                             { query: 'foo-bar' },
      'from:luna test':                      { query: 'test',      username: 'luna' },
      'from:me foo':                         { query: 'foo',       username: 'me' },  // we handle this in controller explicitly
      'test from:luna':                      { query: 'test',      username: 'luna' },
      'from:luna foo bar':                   { query: 'foo & bar', username: 'luna' },
      'foo from:luna bar':                   { query: 'foo & bar', username: 'luna' },
      'group:solar-system foo bar':          { query: 'foo & bar', group: 'solar-system' },
      'foo group:solar-system bar':          { query: 'foo & bar', group: 'solar-system' },
      'foo group:solar-system bar from: me': { query: 'foo & bar', username: 'me', group: 'solar-system' },
      'from:luna group:solar-system':        { username: 'luna', group: 'solar-system' },
    };

    forEach(expectations, (output, input) => {
      it(`should correctly parse "${input}"`, () => {
        expect(SearchQueryParser.parse(input), 'to satisfy', output);
      });
    });
  });

  describe('user context', () => {
    const defaultUsername = 'luna';
    const expectations = {
      'from:me test':                     { query: 'test', username: 'luna' },
      'from:me test group: solar-system': { query: 'test', username: 'luna', group: 'solar-system' },
      'from:me group: solar-system':      { username: 'luna', group: 'solar-system' },
    };

    forEach(expectations, (output, input) => {
      it(`should correctly parse "${input}"`, () => {
        expect(SearchQueryParser.parse(input, defaultUsername), 'to satisfy', output);
      });
    });
  });
});

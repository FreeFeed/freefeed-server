/* eslint-env node, mocha */
/* eslint babel/semi: "error" */
import expect from 'unexpected';
import { forEach } from 'lodash';

import { SearchQueryParser } from '../../../app/support/SearchQueryParser';
import { SEARCH_SCOPES } from '../../../app/support/SearchConstants';

/**
 * Based on friendfeed.com search spec:
 * https://docs.google.com/document/d/1vUydseCSgYgr8-imvD5JWA-R3xcegLS982qyBCMCNAk/edit?pref=2&pli=1#heading=h.32mljutrf1uz
 */
describe('SearchQueryParser', () => {
  describe('anonymous context', () => {
    const expectations = {
      'test':                       { scope: SEARCH_SCOPES.ALL_VISIBLE_POSTS,   query: 'test' },
      'foo -bar':                   { scope: SEARCH_SCOPES.ALL_VISIBLE_POSTS,   query: 'foo & !bar' },
      '-foo bar':                   { scope: SEARCH_SCOPES.ALL_VISIBLE_POSTS,   query: '!foo & bar' },
      'foo-bar':                    { scope: SEARCH_SCOPES.ALL_VISIBLE_POSTS,   query: 'foo-bar' },
      'from:luna test':             { scope: SEARCH_SCOPES.VISIBLE_USER_POSTS,  query: 'test',      username: 'luna' },
      'from:me foo':                { scope: SEARCH_SCOPES.VISIBLE_USER_POSTS,  query: 'foo',       username: 'me' },  // we handle this in controller explicitly
      'test from:luna':             { scope: SEARCH_SCOPES.VISIBLE_USER_POSTS,  query: 'test',      username: 'luna' },
      'from:luna foo bar':          { scope: SEARCH_SCOPES.VISIBLE_USER_POSTS,  query: 'foo & bar', username: 'luna' },
      'foo from:luna bar':          { scope: SEARCH_SCOPES.VISIBLE_USER_POSTS,  query: 'foo & bar', username: 'luna' },
      'group:solar-system foo bar': { scope: SEARCH_SCOPES.VISIBLE_GROUP_POSTS, query: 'foo & bar', group: 'solar-system' },
      'foo group:solar-system bar': { scope: SEARCH_SCOPES.VISIBLE_GROUP_POSTS, query: 'foo & bar', group: 'solar-system' },
    };

    forEach(expectations, (output, input) => {
      it(`should correctly parse "${input}"`, () => {
        const result = SearchQueryParser.parse(input);

        expect(result.scope, 'to equal', output.scope);
        expect(result.query, 'to equal', output.query);

        if (output.scope === SEARCH_SCOPES.VISIBLE_USER_POSTS) {
          expect(result.username, 'to equal', output.username);
        }

        if (output.scope === SEARCH_SCOPES.VISIBLE_GROUP_POSTS) {
          expect(result.group, 'to equal', output.group);
        }
      });
    });
  });

  describe('user context', () => {
    const defaultUsername = 'luna';
    const expectations = { 'from:me test': { scope: SEARCH_SCOPES.VISIBLE_USER_POSTS, query: 'test', username: 'luna' } };

    forEach(expectations, (output, input) => {
      it(`should correctly parse "${input}"`, () => {
        const result = SearchQueryParser.parse(input, defaultUsername);

        expect(result.scope, 'to equal', output.scope);
        expect(result.query, 'to equal', output.query);

        if (output.scope === SEARCH_SCOPES.VISIBLE_USER_POSTS) {
          expect(result.username, 'to equal', output.username);
        }

        if (output.scope === SEARCH_SCOPES.VISIBLE_GROUP_POSTS) {
          expect(result.group, 'to equal', output.group);
        }
      });
    });
  });
});

/*eslint-env node, mocha */
import { expect } from 'chai';
import { forEach } from 'lodash';

import { SearchQueryParser, SEARCH_TYPES } from '../../app/support/SearchQueryParser';

/**
 * Based on friendfeed.com search spec:
 * https://docs.google.com/document/d/1vUydseCSgYgr8-imvD5JWA-R3xcegLS982qyBCMCNAk/edit?pref=2&pli=1#heading=h.32mljutrf1uz
 */
describe('SearchQueryParser', () => {
  const expectations = {
    'test':                       { type: SEARCH_TYPES.DEFAULT,     query: 'test' },
    'from:luna test':             { type: SEARCH_TYPES.USER_POSTS,  query: 'test',      username: 'luna' },
    'test from:luna':             { type: SEARCH_TYPES.USER_POSTS,  query: 'test',      username: 'luna' },
    'from:luna foo bar':          { type: SEARCH_TYPES.USER_POSTS,  query: 'foo & bar', username: 'luna' },
    'foo from:luna bar':          { type: SEARCH_TYPES.USER_POSTS,  query: 'foo & bar', username: 'luna' },
    'group:solar-system foo bar': { type: SEARCH_TYPES.GROUP_POSTS, query: 'foo & bar', group: 'solar-system' },
    'foo group:solar-system bar': { type: SEARCH_TYPES.GROUP_POSTS, query: 'foo & bar', group: 'solar-system' },
  };

  forEach(expectations, (output, input) => {
    it(`should parse "${input}"`, () => {
      const result = SearchQueryParser.parse(input);

      expect(result.type).to.equal(output.type);
      expect(result.query).to.equal(output.query);

      if (output.type === SEARCH_TYPES.USER_POSTS) {
        expect(result.username).to.equal(output.username);
      }

      if (output.type === SEARCH_TYPES.GROUP_POSTS) {
        expect(result.group).to.equal(output.group);
      }
    });
  });
});

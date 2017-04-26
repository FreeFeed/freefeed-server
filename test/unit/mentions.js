/* eslint-env node, mocha */
import _ from 'lodash';
import expect from 'unexpected';

import { extractMentions, extractMentionsWithIndices } from '../../app/support/mentions';

describe('Mentions parser', () => {
  const cases = [
    {
      text:   '@Seven @for the @Dwarf-lords @in @ their halls of@stone',
      result: [
        { username: 'seven', indices: [0, 6] },
        { username: 'for', indices: [7, 11] },
        { username: 'dwarf-lords', indices: [16, 28] }
      ]
    },
    {
      text:   '@1234567890123456789012345',
      result: [{ username: '1234567890123456789012345', indices: [0, 26] }]
    },
    {
      text:   '@12345678901234567890123456',
      result: []
    }
  ];

  cases.forEach(({ text, result }) => {
    it(`should parse "${text}"`, () => {
      expect(extractMentionsWithIndices(text), 'to equal', result);
      expect(extractMentions(text), 'to equal', _.map(result, 'username'));
    });
  });
});



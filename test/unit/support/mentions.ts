/* eslint-env node, mocha */
import _ from 'lodash';
import expect from 'unexpected';

import { extractMentions, extractMentionsWithOffsets } from '../../../app/support/mentions';


describe('Mentions parser', () => {
  const cases = [
    {
      text:   '@Seven @for the @Dwarf-lords @in @ their halls of@stone',
      result: [
        { username: 'seven', offset: 0 },
        { username: 'for', offset: 7 },
        { username: 'dwarf-lords', offset: 16 }
      ]
    },
    {
      text:   '@1234567890123456789012345',
      result: [{ username: '1234567890123456789012345', offset: 0 }]
    },
    {
      text:   '@12345678901234567890123456',
      result: []
    }
  ];

  cases.forEach(({ text, result }) => {
    it(`should parse "${text}"`, () => {
      expect(extractMentionsWithOffsets(text), 'to equal', result);
      expect(extractMentions(text), 'to equal', _.map(result, 'username'));
    });
  });
});



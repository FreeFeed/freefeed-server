/* eslint-env node, mocha */
import expect from 'unexpected';

import {
  AnyText,
  Text,
  Condition,
  ScopeStart,
  InScope,
  IN_COMMENTS,
  IN_POSTS
} from '../../../../app/support/search/parser-tools';
import {
  parseQuery,
  queryComplexity
} from '../../../../app/support/search/parser';


describe('search:parseQuery', () => {
  const testData = [
    {
      query:  '',
      result: []
    },
    {
      query:  'a b c',
      result: [
        new AnyText([new Text(false, false, 'a')]),
        new AnyText([new Text(false, false, 'b')]),
        new AnyText([new Text(false, false, 'c')])
      ]
    },
    {
      query:   'a, #b: c!',
      comment: 'remove the extra punctuation',
      result:  [
        new AnyText([new Text(false, false, 'a')]),
        new AnyText([new Text(false, false, '#b')]),
        new AnyText([new Text(false, false, 'c')])
      ]
    },
    {
      query:  'a | b | c',
      result: [
        new AnyText([
          new Text(false, false, 'a'),
          new Text(false, false, 'b'),
          new Text(false, false, 'c')
        ])
      ]
    },
    {
      query:   'a || | b |',
      comment: 'multiple | should be merged into one',
      result:  [
        new AnyText([new Text(false, false, 'a'), new Text(false, false, 'b')])
      ]
    },
    {
      query:   'a | from:me',
      comment: '| near the operator should be ignored',
      result:  [
        new AnyText([new Text(false, false, 'a')]),
        new Condition(false, 'from', ['me'])
      ]
    },
    {
      query:  'inmy:a,b -c',
      result: [
        new Condition(false, 'in-my', ['a', 'b']),
        new AnyText([new Text(true, false, 'c')])
      ]
    },
    {
      query:   'inmy: -c',
      comment: 'inmy: should become text',
      result:  [
        new AnyText([new Text(false, false, 'inmy')]),
        new AnyText([new Text(true, false, 'c')])
      ]
    },
    {
      query:  'inbody: in-comment:"a b"',
      result: [
        new ScopeStart(IN_POSTS),
        new InScope(IN_COMMENTS, [new AnyText([new Text(false, true, 'a b')])])
      ]
    },
    {
      query:  'inbody: -in-comment:qwer',
      result: [
        new ScopeStart(IN_POSTS),
        new InScope(IN_COMMENTS, [new AnyText([new Text(true, false, 'qwer')])])
      ]
    },
    {
      query:  'inbody: -in-comment:qwer,ty',
      result: [
        new ScopeStart(IN_POSTS),
        new InScope(IN_COMMENTS, [
          new AnyText([new Text(true, false, 'qwer')]),
          new AnyText([new Text(true, false, 'ty')])
        ])
      ]
    },
    {
      query:  'inbody: in-comment:qwer,ty',
      result: [
        new ScopeStart(IN_POSTS),
        new InScope(IN_COMMENTS, [
          new AnyText([
            new Text(false, false, 'qwer'),
            new Text(false, false, 'ty')
          ])
        ])
      ]
    }
  ];

  for (const { query, comment, result } of testData) {
    it(`should parse '${query}'${comment ? ` (${comment})` : ''}`, () => {
      expect(parseQuery(query), 'to satisfy', result);
    });
  }
});

describe('search:queryComplexity', () => {
  const testData = [
    { query: '', result: 0 },
    { query: 'foo', result: 1 },
    { query: 'foo bar from:me', result: 2.5 },
    { query: '"foo bar baz" from:me', result: 3.5 },
    { query: 'foo bar from:me,too', result: 3 },
    { query: 'the really | long and complex in-comment:query', result: 6 }
  ];

  for (const { query, result } of testData) {
    it(`should calculate the '${query}' compexity`, () => {
      expect(queryComplexity(parseQuery(query)), 'to be', result);
    });
  }
});

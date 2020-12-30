/* eslint-env node, mocha */
import expect from 'unexpected';

import { List } from '../../../app/support/open-lists';

describe('Open lists', () => {
  it('should create empty list', () => {
    const list = new List();
    expect(list.isEmpty(), 'to be true');
    expect(list.isEverything(), 'to be false');
    expect(list.items, 'to be empty');
    expect(list.inclusive, 'to be true');
    expect(list.includes(42), 'to be false');
  });

  it('should create "everything" list', () => {
    const list = new List<any>([], false);
    expect(list.isEmpty(), 'to be false');
    expect(list.isEverything(), 'to be true');
    expect(list.items, 'to be empty');
    expect(list.inclusive, 'to be false');
    expect(list.includes(42), 'to be true');
  });

  it('should create empty list via static constructor', () => {
    const list = List.empty();
    expect(list.isEmpty(), 'to be true');
  });

  it('should create "everything" list via static constructor', () => {
    const list = List.everything();
    expect(list.isEverything(), 'to be true');
  });

  it('should create non-empty list', () => {
    const list = new List([42]);
    expect(list.isEmpty(), 'to be false');
    expect(list.items, 'to equal', [42]);
    expect(list.inclusive, 'to be true');
    expect(list.includes(42), 'to be true');
    expect(list.includes(43), 'to be false');
  });

  it('should create non-empty exclusive list', () => {
    const list = new List([42], false);
    expect(list.isEmpty(), 'to be false');
    expect(list.items, 'to equal', [42]);
    expect(list.inclusive, 'to be false');
    expect(list.includes(42), 'to be false');
    expect(list.includes(43), 'to be true');
  });

  describe('operations', () => {
    const runTests = (
      opString: string,
      op: (l1: List<any>, l2: List<any>) => List<any>,
      tests: List<any>[][],
    ) => {
      for (const [a, b, c] of tests) {
        it(`${str(a)} ${opString} ${str(b)} = ${str(c)}`, () => {
          expect(op(a, b), 'to equal', c);
        });
      }
    };

    describe('difference', () => {
      runTests('-', List.difference, [
        [new List([1, 2]), new List([2, 3, 4]), new List([1])],
        [new List([1, 2]), new List([2, 3, 4], false), new List([2])],
        [new List([1, 2], false), new List([2, 3, 4]), new List([1, 2, 3, 4], false)],
        [new List([1, 2], false), new List([2, 3, 4], false), new List([3, 4])],
      ]);
    });

    describe('union', () => {
      runTests('+', List.union, [
        [new List([1, 2]), new List([2, 3, 4]), new List([1, 2, 3, 4])],
        [new List([1, 2]), new List([2, 3, 4], false), new List([3, 4], false)],
        [new List([1, 2], false), new List([2, 3, 4]), new List([1], false)],
        [new List([1, 2], false), new List([2, 3, 4], false), new List([2], false)],
      ]);
    });

    describe('intersection', () => {
      runTests('&', List.intersection, [
        [new List([1, 2]), new List([2, 3, 4]), new List([2])],
        [new List([1, 2]), new List([2, 3, 4], false), new List([1])],
        [new List([1, 2], false), new List([2, 3, 4]), new List([3, 4])],
        [new List([1, 2], false), new List([2, 3, 4], false), new List([1, 2, 3, 4], false)],
      ]);
    });
  });
});

function str(list: List<any>) {
  return `${list.inclusive ? ' ' : '^'}[${list.items.join()}]`;
}

/* eslint-env node, mocha */
import { toPlainObject } from 'lodash';
import expect from 'unexpected';

import {
  extractUUIDs,
  extractShortIds,
  notifyBacklinkedLater,
  notifyBacklinkedNow,
} from '../../../app/support/backlinks';
import { List } from '../../../app/support/open-lists';
import { UUID } from '../../../app/support/types';

describe('Backlinks parser', () => {
  describe('extractUUIDs', () => {
    const cases = [
      { text: 'abc', result: [] },
      {
        text: 'abc 21612a6d-dbfc-4ff1-9c0b-d41502ad3e62',
        result: ['21612a6d-dbfc-4ff1-9c0b-d41502ad3e62'],
      },
      {
        text: 'abc 21612a6d-dbfc-4ff1-9c0b-d41502ad3e62 21612a6d-dbfc-4ff1-9c0b-d41502ad3e62',
        result: ['21612a6d-dbfc-4ff1-9c0b-d41502ad3e62'],
      },
      {
        text: 'abc 21612a6d-dbfc-4ff1-9c0b-d41502ad3e62 21612a6d-dbfc-4ff1-9c0b-d41502ad3e63',
        // ________________________________________________________________________________^
        result: ['21612a6d-dbfc-4ff1-9c0b-d41502ad3e62', '21612a6d-dbfc-4ff1-9c0b-d41502ad3e63'],
      },
      {
        text: 'abc 21612a6d-dbfc-4ff1-9c0b-d41502ad3e62 21612a6d-dbfc-0ff1-9c0b-d41502ad3e63',
        // ___________________________________________________________^ (invalid UUID)
        result: ['21612a6d-dbfc-4ff1-9c0b-d41502ad3e62'],
      },
    ];

    cases.forEach(({ text, result }) => {
      it(`should extract ${result.length} UUID(s) from "${text}"`, () => {
        expect(extractUUIDs(text), 'to equal', result);
      });
    });
  });

  describe('extractShortIds', () => {
    const cases = [
      { text: 'abc', result: [] },
      {
        text: 'abc /venus/f482e5',
        result: ['f482e5'],
      },
      {
        text: 'abc /venus/f482e5 /venus/f482e5',
        result: ['f482e5'],
      },
      {
        text: 'abc /venus/f482e5 /venus/f482e8',
        result: ['f482e5', 'f482e8'],
      },
      {
        text: 'abc /venus/f482e5 /venus/f4g2e5',
        // _______________________________^ (invalid hexadecimal)
        result: ['f482e5'],
      },
      {
        text: 'abc /venus/f482e5 hello mars/4a39b8',
        // ____________________________^ (no starting slash)
        result: ['f482e5'],
      },
      {
        text: 'abc /venus/f482e5 /group-for-very-secret-meetings/4a39b8',
        result: ['f482e5', '4a39b8'],
      },
    ];

    cases.forEach(({ text, result }) => {
      it(`should extract ${result.length} shortId(s) from "${text}"`, () => {
        expect(extractShortIds(text), 'to equal', result);
      });
    });
  });
});

describe('Backlinks notifier', () => {
  const pubSubCalls = [] as { id: UUID; options?: { onlyForUsers: List<UUID> } }[];
  const pubSub = {
    updatePost(id: UUID, options?: { onlyForUsers: List<UUID> }) {
      pubSubCalls.push({ id, options });
      return Promise.resolve();
    },
  };

  const visible = (...byWhoms: List<UUID>[]) => {
    let idx = 0;
    return {
      usersCanSee: () => Promise.resolve(byWhoms[idx++ % byWhoms.length]),
    };
  };

  beforeEach(() => (pubSubCalls.length = 0));

  it(`should notify posts now`, async () => {
    const ids = ['a', 'b', 'c'];
    const scope = List.from(['d', 'e', 'f']);
    await notifyBacklinkedNow(visible(scope), pubSub, ids);
    expect(pubSubCalls, 'to have length', 3);

    for (const id of ids) {
      expect(pubSubCalls, 'to have an item satisfying', {
        id,
        options: { onlyForUsers: toPlainObject(scope) },
      });
    }
  });

  it(`should notify posts later`, async () => {
    const ids = ['a', 'b', 'c'];
    const scopeBefore = List.from(['d', 'e', 'f']);
    const scopeAfter = List.from(['e', 'f', 'g']);
    const scopeTotal = List.union(scopeBefore, scopeAfter);

    const notifyBacklinked = await notifyBacklinkedLater(
      visible(scopeBefore, scopeAfter),
      pubSub,
      ids,
    );
    await notifyBacklinked();
    expect(pubSubCalls, 'to have length', 3);

    for (const id of ids) {
      expect(pubSubCalls, 'to have an item satisfying', {
        id,
        options: { onlyForUsers: toPlainObject(scopeTotal) },
      });
    }
  });
});

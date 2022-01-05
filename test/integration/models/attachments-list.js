/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import { dbAdapter, User } from '../../../app/models';
import cleanDB from '../../dbCleaner';

import { createAttachment } from './attachment-helpers';

describe('listAttachments', () => {
  before(() => cleanDB($pg_database));

  let luna;
  before(async () => {
    luna = new User({ username: 'luna', password: 'pw' });
    await luna.create();
  });

  describe('Luna creates some attachments', () => {
    const allAttachments = [];
    before(async () => {
      const N = 10;

      for (let i = 0; i < N; i++) {
        allAttachments.push(
          // eslint-disable-next-line no-await-in-loop
          await createAttachment(luna.id, { name: `att${i + 1}`, content: 'bar' }),
        );
      }
    });

    it(`should list the latest attachments`, async () => {
      const atts = await dbAdapter.listAttachments({ userId: luna.id, limit: 3 });
      expect(atts, 'to satisfy', [
        { fileName: 'att10' },
        { fileName: 'att9' },
        { fileName: 'att8' },
      ]);
    });

    it(`should list attachments with offset`, async () => {
      const atts = await dbAdapter.listAttachments({
        userId: luna.id,
        limit: 3,
        offset: 2,
      });
      expect(atts, 'to satisfy', [
        { fileName: 'att8' },
        { fileName: 'att7' },
        { fileName: 'att6' },
      ]);
    });
  });
});

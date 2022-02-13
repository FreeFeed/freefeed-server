/* eslint-env node, mocha */
/* global $pg_database */
import unexpected from 'unexpected';
import unexpectedDate from 'unexpected-date';

import { dbAdapter, User } from '../../../../app/models';
import cleanDB from '../../../dbCleaner';
import { createAttachment } from '../../models/attachment-helpers';

const expect = unexpected.clone().use(unexpectedDate);

describe('Attachments DB trait', () => {
  describe('getAttachmentsStats', () => {
    let luna;

    before(async () => {
      await cleanDB($pg_database);

      luna = new User({ username: 'luna', password: 'pw' });
      await luna.create();
    });

    it(`should return zero attachments stats`, async () => {
      const stats = await dbAdapter.getAttachmentsStats(luna.id);
      expect(stats, 'to equal', {
        total: 0,
        sanitized: 0,
      });
    });

    describe(`Luna uploaded one file`, () => {
      before(async () => {
        await createAttachment(luna.id, { name: `foo`, content: 'bar' });
      });

      it(`should return attachments stats with one sanitized attachment`, async () => {
        const stats = await dbAdapter.getAttachmentsStats(luna.id);
        expect(stats, 'to equal', {
          total: 1,
          sanitized: 1,
        });
      });
    });

    describe(`Luna turned sanitize off and uploaded another file`, () => {
      before(() => luna.update({ preferences: { sanitizeMediaMetadata: false } }));
      after(() => luna.update({ preferences: { sanitizeMediaMetadata: true } }));

      before(async () => {
        await createAttachment(luna.id, { name: `foo`, content: 'bar' });
      });

      it(`should return attachments stats with one sanitized attachment`, async () => {
        const stats = await dbAdapter.getAttachmentsStats(luna.id);
        expect(stats, 'to equal', {
          total: 2,
          sanitized: 1,
        });
      });
    });
  });

  describe('AttachmentsSanitizeTask', () => {
    let luna, mars;
    let createdLunaTask, createdMarsTask;

    before(async () => {
      await cleanDB($pg_database);

      luna = new User({ username: 'luna', password: 'pw' });
      mars = new User({ username: 'mars', password: 'pw' });
      await Promise.all([luna.create(), mars.create()]);
    });

    it(`should not return task for Luna`, async () => {
      const task = await dbAdapter.getAttachmentsSanitizeTask(luna.id);
      expect(task, 'to be null');
    });

    it(`should create tasks for Luna and Mars`, async () => {
      const now = await dbAdapter.now();
      [createdLunaTask, createdMarsTask] = await Promise.all([
        dbAdapter.createAttachmentsSanitizeTask(luna.id),
        dbAdapter.createAttachmentsSanitizeTask(mars.id),
      ]);
      expect(createdLunaTask, 'to satisfy', {
        userId: luna.id,
        createdAt: expect.it('to be close to', now),
      });
    });

    it(`should return the same task for Luna on re-creating`, async () => {
      const task = await dbAdapter.createAttachmentsSanitizeTask(luna.id);
      expect(task, 'to equal', createdLunaTask);
    });

    it(`should remove Luna's task`, async () => {
      await dbAdapter.deleteAttachmentsSanitizeTask(luna.id);
      const task = await dbAdapter.getAttachmentsSanitizeTask(luna.id);
      expect(task, 'to be null');
    });

    it(`should still return task for Mars`, async () => {
      const task = await dbAdapter.getAttachmentsSanitizeTask(mars.id);
      expect(task, 'to equal', createdMarsTask);
    });
  });
});

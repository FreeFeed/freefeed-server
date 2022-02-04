/* eslint-env node, mocha */
/* global $pg_database */
import unexpected from 'unexpected';
import unexpectedDate from 'unexpected-date';

import { dbAdapter, User } from '../../../../app/models';
import cleanDB from '../../../dbCleaner';

const expect = unexpected.clone().use(unexpectedDate);

describe('AttachmentsSanitizeTask in DB', () => {
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

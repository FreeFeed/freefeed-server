import createDebug from 'debug';
import { DateTime } from 'luxon';
import Raven from 'raven';

import { dbAdapter, Job, JobManager, type User } from '../models';
import { forEachAsync } from '../support/forEachAsync';
import { UUID } from '../support/types';

const debug = createDebug('freefeed:model:attachment');

export const ATTACHMENTS_SANITIZE = 'ATTACHMENTS_SANITIZE';

export async function startAttachmentsSanitizeJob(user: User) {
  await Job.create(ATTACHMENTS_SANITIZE, { userId: user.id }, { uniqKey: user.id });
  return dbAdapter.createAttachmentsSanitizeTask(user.id);
}

const batchSize = 20;
const maxTTL = 200; // sec

export function initHandlers(jobManager: JobManager) {
  jobManager.on(ATTACHMENTS_SANITIZE, async (job: Job<{ userId: UUID }>) => {
    const { userId } = job.payload;

    await job.setUnlockAt(maxTTL * 1.5);
    const workUntil = DateTime.local().plus({ seconds: maxTTL }).toJSDate();

    const attachments = await dbAdapter.getNonSanitizedAttachments(userId, batchSize);

    if (attachments.length === 0) {
      // Nothing to do
      await dbAdapter.deleteAttachmentsSanitizeTask(userId);
      return;
    }

    await forEachAsync(attachments, async (att) => {
      if (new Date() > workUntil) {
        return;
      }

      try {
        await att.sanitizeOriginal();
      } catch (err) {
        debug(`${ATTACHMENTS_SANITIZE}: cannot sanitize attachment ${att.id}: ${err}`);
        Raven.captureException(err as Error, {
          extra: { err: `${ATTACHMENTS_SANITIZE}: cannot sanitize attachment: ${att.id}` },
        });
      }
    });

    // Repeat this job
    await job.keep(0);
  });
}

import createDebug from 'debug';
import { DateTime } from 'luxon';
import Raven from 'raven';

import { dbAdapter, Job, JobManager, type User } from '../models';
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

    // Check if this job is stuck
    {
      const { total: totalAttachments } = await dbAdapter.getAttachmentsStats(userId);
      const estJobRuns = totalAttachments / batchSize;

      if (job.attempts > estJobRuns * 2) {
        debug(
          `${ATTACHMENTS_SANITIZE}: the job is stuck for user ${userId} (${job.attempts} attempts)`,
        );
        Raven.captureException(
          new Error(
            `${ATTACHMENTS_SANITIZE}: the job is stuck for user ${userId} (${job.attempts} attempts)`,
          ),
        );

        await dbAdapter.deleteAttachmentsSanitizeTask(userId);

        // Don't keep it
        return;
      }
    }

    await job.setUnlockAt(maxTTL * 1.5);
    const workUntil = DateTime.local().plus({ seconds: maxTTL }).toJSDate();

    const attachments = await dbAdapter.getNonSanitizedAttachments(userId, batchSize);

    if (attachments.length === 0) {
      // Nothing to do
      await dbAdapter.deleteAttachmentsSanitizeTask(userId);
      return;
    }

    for (const att of attachments) {
      if (new Date() > workUntil) {
        break;
      }

      // eslint-disable-next-line no-await-in-loop
      await att.sanitizeOriginal();
    }

    // Repeat this job
    await job.keep(0);
  });
}

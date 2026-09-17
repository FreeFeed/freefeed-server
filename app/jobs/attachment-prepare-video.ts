import createDebug from 'debug';

import { dbAdapter, Job, JobManager } from '../models';
import type { UUID } from '../support/types';

type Payload = { filePath: string; attId: UUID };

const debug = createDebug('freefeed:model:attachment');

export const ATTACHMENT_PREPARE_VIDEO = 'ATTACHMENT_PREPARE_VIDEO';

export async function createPrepareVideoJob(payload: Payload): Promise<void> {
  await Job.create(ATTACHMENT_PREPARE_VIDEO, payload, { uniqKey: payload.attId });
}

export function initHandlers(jobManager: JobManager) {
  // Allow only one job at a time
  jobManager.limitedJobs[ATTACHMENT_PREPARE_VIDEO] = 1;

  jobManager.on(ATTACHMENT_PREPARE_VIDEO, async (job: Job<Payload>) => {
    const { filePath, attId } = job.payload;
    const att = await dbAdapter.getAttachmentById(attId);

    if (!att) {
      debug(`${job.name}: the attachment ${attId} does not exist`);
      return;
    }

    if (!att.meta.inProgress) {
      debug(`${job.name}: the attachment ${attId} is already processed`);
      return;
    }

    await att.finalizeCreation(filePath);
  });
}

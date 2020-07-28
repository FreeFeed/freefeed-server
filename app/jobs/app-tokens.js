import { DateTime } from 'luxon';

import { Job, dbAdapter } from '../models';


export const APP_TOKEN_INACTIVATE = 'APP_TOKEN_INACTIVATE';

// Job creators
export function scheduleTokenInactivation(token) {
  if (!token.expiresAt) {
    return Promise.resolve(null);
  }

  const unlockAt = DateTime.fromJSDate(token.expiresAt)
    .plus({ minutes: 10 })
    .toJSDate();

  return Job.create(APP_TOKEN_INACTIVATE, { tokenId: token.id }, { unlockAt });
}

/**
 * Job handlers
 *
 * @param {JobManager} jobManager
 */
export function initHandlers(jobManager) {
  jobManager.on(APP_TOKEN_INACTIVATE, async (job) => {
    const token = await dbAdapter.getAppTokenById(job.payload.tokenId);

    if (!token?.isActive) {
      return;
    }

    await token.inactivate();
  });
}

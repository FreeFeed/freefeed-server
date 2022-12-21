import { JobManager, dbAdapter } from '../../models';

import { definePeriodicJob } from '.';

export const PERIODIC_CLEAN_FROZEN_USERS = 'PERIODIC_CLEAN_FROZEN_USERS';

export function initHandlers(jobManager: JobManager) {
  return definePeriodicJob(jobManager, {
    name: PERIODIC_CLEAN_FROZEN_USERS,
    handler: () => dbAdapter.cleanFrozenUsers(),
    nextTime: 60 * 60, // every hour
    payload: {},
  });
}

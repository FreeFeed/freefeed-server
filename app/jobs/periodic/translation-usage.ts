import { JobManager, dbAdapter } from '../../models';

import { definePeriodicJob } from '.';

export const PERIODIC_CLEAN_TRANSLATION_USAGE = 'PERIODIC_CLEAN_TRANSLATION_USAGE';

export function initHandlers(jobManager: JobManager) {
  return definePeriodicJob(jobManager, {
    name: PERIODIC_CLEAN_TRANSLATION_USAGE,
    handler: () => dbAdapter.cleanOldTranslationUsageData(),
    nextTime: 24 * 3600, // every day
    payload: {},
  });
}

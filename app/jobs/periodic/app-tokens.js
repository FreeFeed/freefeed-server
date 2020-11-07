import { dbAdapter } from '../../models';

import { definePeriodicJob } from '.';


export const PERIODIC_INACTIVATE_APP_TOKENS = 'PERIODIC_INACTIVATE_APP_TOKENS';

export function initHandlers(jobManager) {
  return definePeriodicJob(jobManager, {
    name:     PERIODIC_INACTIVATE_APP_TOKENS,
    handler:  () => dbAdapter.periodicInvalidateAppTokens(),
    nextTime: () => new Date(Date.now() + (10 * 60 * 1000)), // every 10 minutes
  });
}

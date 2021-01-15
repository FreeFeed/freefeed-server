import config from 'config';

import { dbAdapter } from '../../models';

import { definePeriodicJob } from '.';

export const PERIODIC_INACTIVATE_APP_TOKENS = 'PERIODIC_INACTIVATE_APP_TOKENS';
export const PERIODIC_REAUTH_REALTIME = 'PERIODIC_REAUTH_REALTIME';
export const PERIODIC_CLEAN_AUTH_SESSIONS = 'PERIODIC_CLEAN_AUTH_SESSIONS';

export function initHandlers(jobManager, app) {
  return Promise.all([
    definePeriodicJob(jobManager, {
      name: PERIODIC_INACTIVATE_APP_TOKENS,
      handler: () => dbAdapter.periodicInvalidateAppTokens(),
      nextTime: () => new Date(Date.now() + 10 * 60 * 1000), // every 10 minutes
    }),
    definePeriodicJob(jobManager, {
      name: PERIODIC_CLEAN_AUTH_SESSIONS,
      handler: () =>
        dbAdapter.cleanOldAuthSessions(
          config.authSessions.activeSessionTTLDays,
          config.authSessions.inactiveSessionTTLDays,
        ),
      nextTime: () => new Date(Date.now() + config.authSessions.cleanupIntervalSec * 1000),
    }),
    definePeriodicJob(jobManager, {
      name: PERIODIC_REAUTH_REALTIME,
      handler: () => app.context.pubsub.reAuthorizeSockets(),
      nextTime: () => new Date(Date.now() + 5 * 60 * 1000), // every 5 minutes
    }),
  ]);
}

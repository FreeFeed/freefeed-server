import config from 'config';

import { dbAdapter, JobManager } from '../../models';
import FreefeedApp from '../../freefeed-app';

import { definePeriodicJob } from '.';

export const PERIODIC_INACTIVATE_APP_TOKENS = 'PERIODIC_INACTIVATE_APP_TOKENS';
export const PERIODIC_REAUTH_REALTIME = 'PERIODIC_REAUTH_REALTIME';
export const PERIODIC_CLEAN_AUTH_SESSIONS = 'PERIODIC_CLEAN_AUTH_SESSIONS';

export function initHandlers(jobManager: JobManager, app: FreefeedApp) {
  return Promise.all([
    definePeriodicJob(jobManager, {
      name: PERIODIC_INACTIVATE_APP_TOKENS,
      handler: () => dbAdapter.periodicInvalidateAppTokens(),
      nextTime: 10 * 60, // every 10 minutes
      payload: {},
    }),
    definePeriodicJob(jobManager, {
      name: PERIODIC_CLEAN_AUTH_SESSIONS,
      handler: () =>
        dbAdapter.cleanOldAuthSessions(
          config.authSessions.activeSessionTTLDays,
          config.authSessions.inactiveSessionTTLDays,
        ),
      nextTime: config.authSessions.cleanupIntervalSec,
      payload: {},
    }),
    definePeriodicJob(jobManager, {
      name: PERIODIC_REAUTH_REALTIME,
      handler: () => app.context.pubsub.reAuthorizeSockets(),
      nextTime: 5 * 60, // every 5 minutes
      payload: {},
    }),
  ]);
}

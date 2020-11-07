import { definePeriodicJob } from '.';


export const PERIODIC_REAUTH_REALTIME = 'PERIODIC_REAUTH_REALTIME';

export function initHandlers(jobManager, app) {
  return definePeriodicJob(jobManager, {
    name:     PERIODIC_REAUTH_REALTIME,
    handler:  () => app.context.pubsub.reAuthorizeSockets(),
    nextTime: () => new Date(Date.now() + (5 * 60 * 1000)), // every 5 minutes
  });
}

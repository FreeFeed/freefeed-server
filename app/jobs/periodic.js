import createDebug from 'debug';
import Raven from 'raven';
import config from 'config';

import { Job } from '../models';


const debugError = createDebug('freefeed:jobs:errors');

const PERIODIC_REAUTH_REALTIME = 'PERIODIC_REAUTH_REALTIME';

export function initHandlers(jobManager, app) {
  definePeriodicJob(jobManager, {
    name:     PERIODIC_REAUTH_REALTIME,
    handler:  () => app.context.pubsub.reAuthorizeSockets(),
    nextTime: () => new Date(Date.now() + (5 * 60 * 1000)), // every 5 minutes
  });
}

////////////////////////////////////

export async function definePeriodicJob(jobManager, { name, payload = {}, handler, nextTime }) {
  jobManager.on(name, async (job) => {
    try {
      await handler(job);
    } catch (err) {
      // Do not retry periodic jobs
      debugError(`error processing periodic job '${job.name}'`, err, job);

      if ('sentryDsn' in config) {
        Raven.captureException(
          err,
          { extra: { err: `error processing job '${job.name}': ${err.message}` } }
        );
      }
    }

    await job.clone(nextTime());
  });
  // Create a first job
  await Job.create(name, payload, { uniqKey: 'periodic', unlockAt: nextTime() });
}

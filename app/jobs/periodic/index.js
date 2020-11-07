import createDebug from 'debug';
import Raven from 'raven';
import config from 'config';

import { Job } from '../../models';

import { initHandlers as initReauthRealtimeHandlers } from './reauth-realtime';
import { initHandlers as initAppTokensHandlers } from './app-tokens';


const debugError = createDebug('freefeed:jobs:errors');

export async function initHandlers(jobManager, app) {
  await Promise.all([
    initReauthRealtimeHandlers(jobManager, app),
    initAppTokensHandlers(jobManager, app),
  ]);
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

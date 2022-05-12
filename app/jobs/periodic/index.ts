import config from 'config';
import createDebug from 'debug';
import Raven from 'raven';

import FreefeedApp from '../../freefeed-app';
import { Job, type JobHandler, JobManager } from '../../models';

import { initHandlers as initAuthTokensHandlers } from './auth-tokens';

const debugError = createDebug('freefeed:jobs:errors');

export async function initHandlers(jobManager: JobManager, app: FreefeedApp) {
  await Promise.all([initAuthTokensHandlers(jobManager, app)]);
}

////////////////////////////////////

type PeriodicJobParams<P> = {
  name: string;
  payload: P;
  handler: JobHandler<P>;
  // Number of seconds or function, that generates the next unlock time
  nextTime: number | (() => Date | number);
};

export async function definePeriodicJob<P>(
  jobManager: JobManager,
  { name, payload, handler, nextTime }: PeriodicJobParams<P>,
) {
  jobManager.on(name, async (job: Job<P>) => {
    try {
      await handler(job);
    } catch (err) {
      // Do not retry periodic jobs
      debugError(`error processing periodic job '${job.name}'`, err, job);

      if ('sentryDsn' in config && err instanceof Error) {
        Raven.captureException(err, {
          extra: { err: `error processing job '${job.name}': ${err.message}` },
        });
      }
    }

    await job.keep(getNextTime(nextTime));
  });
  // Create a first job
  await Job.create(name, payload, { uniqKey: 'periodic', unlockAt: getNextTime(nextTime) });
}

function getNextTime(nextTime: Date | number | (() => Date | number)) {
  return typeof nextTime === 'function' ? nextTime() : nextTime;
}

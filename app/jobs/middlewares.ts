import { setInterval } from 'timers/promises';

import createDebug from 'debug';
import Raven from 'raven';
import monitor from 'monitor-dog';
import config from 'config';

import { Job } from '../models';
import type { JobHandler } from '../models';

const debug = createDebug('freefeed:jobs:debug');

/**
 * Use monitor and Sentry to collect job statistics and report errors
 */
export function sentryMiddleware(handler: JobHandler<unknown>): JobHandler<unknown> {
  return async (job: Job) => {
    const timerName = `job-${job.name}-time`;
    const requestsName = `job-${job.name}-requests`;
    const errorsName = `job-${job.name}-errors`;

    const timer = monitor.timer(timerName);

    try {
      const result = await handler(job);
      monitor.increment(requestsName);
      return result;
    } catch (err) {
      monitor.increment(errorsName);

      if (err instanceof Error && 'sentryDsn' in config) {
        Raven.captureException(err, {
          extra: { err: `error processing job '${job.name}': ${err.message}` },
        });
      }

      // Job is still failed
      throw err;
    } finally {
      timer.stop();
    }
  };
}

/**
 * Keep the job locked while it is being processed and re-lock it every
 * _jobLockTime_
 */
export function keepJobLockedMiddleware(handler: JobHandler<unknown>): JobHandler<unknown> {
  return async (job: Job) => {
    const refreshInterval = config.jobManager.jobLockTime;
    const abortController = new AbortController();

    try {
      // The 'keepJobLocked' will not be settled until the controller is
      // aborted, so the race will always return the result of the 'handler'.
      return await Promise.race([
        handler(job),
        keepJobLocked(job, refreshInterval, abortController.signal),
      ]);
    } finally {
      abortController.abort(); // Stop the refresh timer
    }
  };
}

async function keepJobLocked(job: Job, intervalSec: number, signal: AbortSignal): Promise<void> {
  // Re-lock the job every 0.7 of 'intervalSec'

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for await (const _ of setInterval(intervalSec * 1000 * 0.7, null, { signal })) {
    debug(`${job.name}: re-locking the job ${job.id}`);
    await job.setUnlockAt(intervalSec);
  }
}

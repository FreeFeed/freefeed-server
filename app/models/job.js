import createDebug from 'debug';
import Raven from 'raven';
import config from 'config';

const sentryIsEnabled = 'sentryDsn' in config;
const debug = createDebug('freefeed:jobs:debug');
const debugError = createDebug('freefeed:jobs:errors');

export function addJobModel(dbAdapter) {
  return class Job {
    id;
    createdAt;
    unlockAt;
    name;
    payload;
    attempts;
    uniqKey;

    constructor(params) {
      for (const f of Object.keys(this)) {
        if (f in params) {
          this[f] = params[f];
        }
      }
    }

    /**
     * Create and place a new job
     *
     * @param {string} name
     * @param {any} payload
     * @param {object} params
     * @returns {Promise<Job>}
     */
    static create(name, payload = {}, { unlockAt = 0, uniqKey = null } = {}) {
      _checkUnlockAtType(unlockAt);
      return dbAdapter.createJob(name, payload, { unlockAt, uniqKey });
    }

    static getById(id) {
      return dbAdapter.getJobById(id);
    }

    /**
     * @returns {Promise<void>}
     */
    async setUnlockAt(unlockAt = 0) {
      _checkUnlockAtType(unlockAt);
      const modified = await dbAdapter.setJobUnlockAt(this.id, unlockAt);
      this.unlockAt = modified.unlockAt;
    }

    /**
     * Delete job. The job handler must call this method when the job is
     * processed.
     * @returns {Promise<void>}
     */
    delete() {
      return dbAdapter.deleteJob(this.id);
    }

    /**
     * Create a new job with the same properties as this but with a new unlockAt
     * time.
     *
     * @returns {Promise<Job>}
     */
    clone(unlockAt = 0) {
      return Job.create(this.name, this.payload, { uniqKey: this.uniqKey, unlockAt });
    }
  };
}

export function addJobManagerModel(dbAdapter) {
  return class JobManager {
    pollInterval;
    jobLockTime;
    batchSize;

    _pollTimer = null;
    _handlers = new Map();

    constructor({
      pollInterval = 5, // 5 sec
      jobLockTime = 120, // 2 min
      batchSize = 5,
    } = {}) {
      this.pollInterval = pollInterval;
      this.jobLockTime = jobLockTime;
      this.batchSize = batchSize;
    }

    /**
     * Middleware is function that takes the job handler and returns a modified
     * job handler. The no-op middleware looks like (handler) => (job) =>
     * handler(job).
     *
     * Handler can return some value which may be useful for other middlewares,
     * so the polite middleware should also return this value.
     *
     * If middleware handles job exceptions, it shold re-throw them for the
     * proper job error handling. "Eat" exception only if you intend to mark job
     * as successfully completed.
     *
     * @param {Function} mw
     */
    use(mw) {
      const prev = this._getHandler;
      this._getHandler = (handler) => mw(prev(handler));
    }

    // The root middleware just selects proper handler
    _getHandler = () => (job) => (this._handlers.get(job.name) || noHandler)(job);

    startPolling() {
      debug('starting polling');
      this._pollTimer = setInterval(
        () =>
          this.fetchAndProcess().catch((err) => {
            debugError('cannot fetch jobs', err);

            if (sentryIsEnabled) {
              Raven.captureException(err, { extra: { err: `cannot fetch jobs: ${err.message}` } });
            }
          }),
        this.pollInterval * 1000,
      );
    }

    stopPolling() {
      debug('stopping polling');
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }

    async fetch(count = this.batchSize, lockTime = this.jobLockTime) {
      debug('fetching jobs');
      const jobs = await dbAdapter.fetchJobs(count, lockTime);
      debug(`${jobs.length} jobs found`);
      return jobs;
    }

    /**
     * Fetch and process jobs. This method will not fail if any job fail, all
     * exceptions should be handled in middlewares.
     *
     * @param {number} count
     * @param {number} lockTime
     */
    async fetchAndProcess(count = this.batchSize, lockTime = this.jobLockTime) {
      const jobs = await this.fetch(count, lockTime);
      // Wait for all handlers
      await Promise.allSettled(jobs.map(this._process));
      return jobs;
    }

    /**
     * Set the main handler for the jobs with the given name
     *
     * Any name can (and should) have only one main handler. If job handler
     * hasn't been set, the job process failed.
     *
     * @param {string} name
     * @param {Function} handler
     */
    on(name, handler) {
      if (this._handlers.has(name)) {
        // Only one handler per name is allowed
        debugError(`attempt to add a second handler for '${name}' jobs`);
        throw new Error(`attempt to add a second handler for '${name}' jobs`);
      }

      this._handlers.set(name, handler);

      // Return unsubscribe function
      return () => this._handlers.delete(name);
    }

    _process = async (job) => {
      try {
        await this._getHandler()(job);
        await job.delete();
      } catch (err) {
        debugError(`error processing job '${job.name}'`, err, job);

        if (sentryIsEnabled) {
          Raven.captureException(err, { extra: { err: `error processing job '${job.name}'` } });
        }

        await job.setUnlockAt(this.jobLockTime * job.attempts ** 1.5);
      }
    };
  };
}

/**
 * unlockAt can be:
 * - Date object (will be interpreted as a DB server time)
 * - number (of seconds from now)
 */
function _checkUnlockAtType(unlockAt = null) {
  if (!(unlockAt instanceof Date) && !Number.isFinite(unlockAt)) {
    throw new Error('Invalid type of unlockAt parameter');
  }
}

function noHandler(job) {
  throw new Error(`handler is not registered for '${job.name}'`);
}

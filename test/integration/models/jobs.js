/* eslint-env node, mocha */
/* global $pg_database */
import unexpected from 'unexpected';
import unexpectedDate from 'unexpected-date';
import unexpectedSinon from 'unexpected-sinon';
import sinon from 'sinon';
import { sortBy } from 'lodash';

import cleanDB from '../../dbCleaner';
import { Job, dbAdapter, JobManager } from '../../../app/models';


const expect = unexpected.clone();
expect
  .use(unexpectedDate)
  .use(unexpectedSinon);

describe('Jobs', () => {
  describe('Single job operations', () => {
    before(() => cleanDB($pg_database));

    it(`should create a job`, async () => {
      const [job, now] = await Promise.all([Job.create('job'), dbAdapter.now()]);
      expect(job, 'to satisfy', {
        name:      'job',
        payload:   {},
        createdAt: expect.it('to be close to', now),
        unlockAt:  expect.it('to be close to', now),
      });
    });

    it(`should delete a job`, async () => {
      const job = await Job.create('job');

      expect(await Job.getById(job.id), 'not to be null');
      await job.delete();
      expect(await Job.getById(job.id), 'to be null');
    });

    it(`should create a job with scalar payload`, async () => {
      const job = await Job.create('job', 42);
      expect(job, 'to satisfy', { name: 'job', payload: 42 });
    });

    it(`should create a job with object payload`, async () => {
      const job = await Job.create('job', { foo: 42 });
      expect(job, 'to satisfy', { name: 'job', payload: { foo: 42 } });
    });

    it(`should create a deferred job with integer offset`, async () => {
      const [job, now] = await Promise.all([
        Job.create('job', {}, { unlockAt: 100 }),
        dbAdapter.now(),
      ]);
      expect(job, 'to satisfy', {
        name:      'job',
        payload:   {},
        createdAt: expect.it('to be close to', now),
        unlockAt:  expect.it('to be close to', new Date(now.getTime() + (100 * 1000))),
      });
    });

    it(`should create a deferred job with float offset`, async () => {
      const [job, now] = await Promise.all([
        Job.create('job', {}, { unlockAt: 100.45 }),
        dbAdapter.now(),
      ]);
      expect(job, 'to satisfy', {
        name:      'job',
        payload:   {},
        createdAt: expect.it('to be close to', now),
        unlockAt:  expect.it('to be close to', new Date(now.getTime() + (100.45 * 1000))),
      });
    });

    it(`should create a deferred job with exact Date`, async () => {
      const unlockAt = new Date(Date.now() + 12345000);
      const [job, now] = await Promise.all([
        Job.create('job', {}, { unlockAt }),
        dbAdapter.now(),
      ]);
      expect(job, 'to satisfy', {
        name:      'job',
        payload:   {},
        createdAt: expect.it('to be close to', now),
        unlockAt:  expect.it('to be close to', unlockAt),
      });
    });

    it(`should update unlock time a job after creation`, async () => {
      const [job, now] = await Promise.all([
        Job.create('job'),
        dbAdapter.now(),
      ]);
      expect(job, 'to satisfy', { unlockAt: expect.it('to be close to', now) });
      await job.setUnlockAt(100);
      expect(job, 'to satisfy', { unlockAt: expect.it('to be close to', new Date(now.getTime() + (100 * 1000))) });
    });
  });

  describe('Jobs with unique keys', () => {
    before(() => cleanDB($pg_database));

    it(`should create multiple jobs with the same name and without keys`, async () => {
      const [job1, job2] = await Promise.all([Job.create('job'), Job.create('job')]);
      expect(job1, 'not to be null');
      expect(job2, 'not to be null');
      expect(job1.id, 'not to be', job2.id);

      await job1.delete();
      await job2.delete();
    });

    it(`should update existing job with same key`, async () => {
      const job1 = await Job.create('job', 42, { unlockAt: 100, uniqKey: 'key' });
      const [job2, now] = await Promise.all([
        Job.create('job', 43, { unlockAt: 200, uniqKey: 'key' }),
        dbAdapter.now(),
      ]);
      expect(job2, 'to satisfy', {
        id:       job1.id,
        payload:  43,
        unlockAt: expect.it('to be close to', new Date(now.getTime() + (200 * 1000))),
      });
    });
  });

  describe('Job manager', () => {
    beforeEach(() => cleanDB($pg_database));

    let jm;
    beforeEach(() => (jm = new JobManager()));

    it('should not fetch jobs from empty queue', async () => {
      const jobs = await jm.fetch();
      expect(jobs, 'to be empty');
    });

    it('should fetch placed jobs', async () => {
      const [job1, now] = await Promise.all([
        Job.create('job'),
        dbAdapter.now(),
      ]);
      const job2 = await Job.create('job');
      const jobs = await jm.fetch();

      expect(sortBy(jobs, 'createdAt'), 'to satisfy', [
        {
          id:       job1.id,
          unlockAt: expect.it('to be close to', new Date(now.getTime() + (jm.jobLockTime * 1000))),
        },
        {
          id:       job2.id,
          unlockAt: expect.it('to be close to', new Date(now.getTime() + (jm.jobLockTime * 1000))),
        }
      ]);
    });

    it('should fetch placed job only once', async () => {
      const job = await Job.create('job');

      {
        const jobs = await jm.fetch();
        expect(jobs, 'to satisfy', [{ id: job.id }]);
      }

      {
        const jobs = await jm.fetch();
        expect(jobs, 'to be empty');
      }
    });

    it('should fetch placed job again after the timeout', async () => {
      const job = await Job.create('job');

      {
        const jobs = await jm.fetch();
        expect(jobs, 'to satisfy', [{ id: job.id }]);
      }

      // Manually reset the job lock time to 'now'
      await job.setUnlockAt(0);

      {
        const jobs = await jm.fetch();
        expect(jobs, 'to satisfy', [{ id: job.id }]);
      }
    });

    describe('Job processing', () => {
      it(`should not allow to assign two job handlers`, () => {
        jm.on('job', () => null);
        expect(() => jm.on('job', () => null), 'to throw');
      });

      it(`should fetch and process jobs`, async () => {
        const spy1 = sinon.spy();
        const spy2 = sinon.spy();
        jm.on('job1', spy1);
        jm.on('job2', spy2);

        const job1 = await Job.create('job1');
        const job2 = await Job.create('job2');

        await jm.fetchAndProcess();

        expect(spy1, 'to have a call satisfying', [{ id: job1.id }]);
        expect(spy2, 'to have a call satisfying', [{ id: job2.id }]);

        // Jobs should be deleted
        expect(await Job.getById(job1.id), 'to be null');
        expect(await Job.getById(job2.id), 'to be null');
      });

      it(`should re-lock job if it have no handler`, async () => {
        const [job, now] = await Promise.all([
          Job.create('job'),
          dbAdapter.now(),
        ]);

        const [job1] = await jm.fetchAndProcess();

        expect(job1, 'to satisfy', {
          id:       job.id,
          attempts: 1,
          unlockAt: expect.it('to be close to', new Date(now.getTime() + (jm.jobLockTime * 1000))),
        });
      });

      describe(`Middlewares`, () => {
        it(`should wrap handler by middlewares`, async () => {
          const calls = [];

          jm.use((handler) => async (job) => {
            calls.push(`m1-before(${job.name})`);
            await handler(job);
            calls.push(`m1-after(${job.name})`);
          });
          jm.use((handler) => async (job) => {
            calls.push(`m2-before(${job.name})`);
            await handler(job);
            calls.push(`m2-after(${job.name})`);
          });

          jm.on('job', (job) => calls.push(`handler(${job.name})`));

          await Job.create('job');
          await jm.fetchAndProcess();

          expect(calls, 'to equal', [
            'm2-before(job)',
            'm1-before(job)',
            'handler(job)',
            'm1-after(job)',
            'm2-after(job)',
          ]);
        });

        it(`should handle exceptions in middlewares`, async () => {
          const calls = [];

          jm.use((handler) => async (job) => {
            try {
              calls.push(`m1-before(${job.name})`);
              await handler(job);
              calls.push(`m1-after(${job.name})`);
            } catch (e) {
              calls.push(`m1-exception(${job.name}, ${e.message})`);
              throw e;
            }
          });
          jm.use((handler) => async (job) => {
            calls.push(`m2-before(${job.name})`);
            await handler(job);
            calls.push(`m2-after(${job.name})`);
          });

          // No handler for 'job'

          await Job.create('job');
          await jm.fetchAndProcess();

          expect(calls, 'to equal', [
            'm2-before(job)',
            'm1-before(job)',
            `m1-exception(job, handler is not registered for 'job')`,
          ]);
        });
      });
    });
  });
});

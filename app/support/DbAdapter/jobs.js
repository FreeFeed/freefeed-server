import { Job } from '../../models';

import { prepareModelPayload, initObject } from './utils';


export default function jobsTrait(superClass) {
  return class extends superClass {
    async createJob(name, payload = {}, { unlockAt } = {}) {
      const row = await this.database.getRow(
        `insert into jobs 
          (name, payload, unlock_at) values (:name, :payload, :unlockAt)
          returning *`,
        { name, payload, unlockAt: this._jobUnlockAt(unlockAt) }
      );

      return initJobObject(row);
    }

    async setJobUnlockAt(id, unlockAt) {
      const [row] = await this.database('jobs')
        .update({ unlock_at: this._jobUnlockAt(unlockAt) })
        .where({ id })
        .returning('*');
      return initJobObject(row);
    }

    async getJobById(id) {
      const row = await this.database.getRow(`select * from jobs where id = :id`, { id });
      return initJobObject(row);
    }

    async deleteJob(id) {
      await this.database.raw(`delete from jobs where id = :id`, { id });
    }

    async fetchJobs(count, lockTime) {
      const rows = await this.database.getAll(
        `update jobs set
            unlock_at = now() + :lockTime * '1 second'::interval,
            attempts = attempts + 1
          where id = any(
            select id from jobs 
            where unlock_at <= now()
            order by unlock_at
            for update skip locked
            limit :count
          )
          returning *`,
        { count, lockTime });
      return rows.map(initJobObject);
    }

    _jobUnlockAt(unlockAt) {
      if (Number.isFinite(unlockAt)) {
        return this.database.raw(`now() + :unlockAt * '1 second'::interval`, { unlockAt });
      } else if (unlockAt instanceof Date) {
        return unlockAt.toISOString();
      }

      return this.database.raw('default');
    }
  }
}

function initJobObject(row) {
  if (!row) {
    return null;
  }

  row = prepareModelPayload(row, JOB_FIELDS, JOB_FIELDS_MAPPING);
  return initObject(Job, row, row.id);
}

const JOB_FIELDS = {
  id:         'id',
  created_at: 'createdAt',
  unlock_at:  'unlockAt',
  name:       'name',
  payload:    'payload',
  attempts:   'attempts',
};

const JOB_FIELDS_MAPPING = {};

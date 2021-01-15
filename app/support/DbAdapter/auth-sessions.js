import { SessionTokenV1 } from '../../models';
import { ACTIVE } from '../../models/auth-tokens/SessionTokenV1';

import { prepareModelPayload } from './utils';

const authSessionsTrait = (superClass) =>
  class extends superClass {
    /**
     * Creates new session. If the params.id is defined, creates new session only
     * if this id is not exists, otherwise returns the existing session.
     */
    async createAuthSession(params) {
      const preparedPayload = prepareModelPayload(
        params,
        AUTH_SESSION_COLUMNS,
        AUTH_SESSION_COLUMNS_MAPPING,
      );

      const insertSQL = this.database('auth_sessions').insert(preparedPayload).toString();
      const row = await this.database.getRow(
        `${insertSQL} on conflict (uid) do update set uid = excluded.uid
        returning *, now() as database_time`,
      );

      return initObject(row, this);
    }

    async getAuthSessionById(uid) {
      const row = await this.database.getRow(
        `select *, now() as database_time from auth_sessions where uid = :uid`,
        { uid },
      );
      return initObject(row, this);
    }

    async updateAuthSession(uid, payload) {
      const preparedPayload = prepareModelPayload(
        payload,
        AUTH_SESSION_COLUMNS,
        AUTH_SESSION_COLUMNS_MAPPING,
      );
      const [row] = await this.database('auth_sessions')
        .where('uid', uid)
        .update({ updated_at: 'now', ...preparedPayload })
        .returning(['*', this.database.raw('now() as database_time')]);

      return initObject(row, this);
    }

    async reissueActiveAuthSession(uid) {
      const row = await this.database.getRow(
        `update auth_sessions 
        set issue = issue + 1, updated_at = now()
        where uid = :uid and status = :status
        returning *, now() as database_time`,
        { uid, status: ACTIVE },
      );
      return initObject(row, this);
    }

    async registerAuthSessionUsage(uid, { ip, userAgent, debounceSec }) {
      const row = await this.database.getRow(
        `update auth_sessions set 
         last_ip = :ip, 
         last_user_agent = :userAgent,
         last_used_at = now()
       where
         uid = :id 
         and (
           last_ip is distinct from :ip 
           or last_user_agent is distinct from :userAgent 
           or last_used_at < now() - :debounceSec * '1 second'::interval
         )
       returning *, now() as database_time`,
        { id: uid, ip, userAgent, debounceSec },
      );
      return initObject(row, this);
    }

    deleteAuthSession(id) {
      return this.database.getOne(`delete from auth_sessions where uid = :id returning true`, {
        id,
      });
    }

    async listAuthSessions(userId) {
      const rows = await this.database.getAll(
        `select *, now() as database_time from auth_sessions
          where user_id = :userId 
          order by created_at desc`,
        { userId },
      );

      return rows.map((r) => initObject(r, this));
    }

    async cleanOldAuthSessions(activeTTLDays, inactiveTTLDays) {
      await this.database.raw(
        `delete from auth_sessions where
        status = :activeStatus and updated_at < now() - :activeTTLDays * '1 day'::interval
        or status <> :activeStatus and updated_at < now() - :inactiveTTLDays * '1 day'::interval`,
        { activeTTLDays, inactiveTTLDays, activeStatus: ACTIVE },
      );
    }
  };

export default authSessionsTrait;

/////////////////////

function initObject(row, db) {
  if (!row) {
    return null;
  }

  row = prepareModelPayload(row, AUTH_SESSION_FIELDS, AUTH_SESSION_FIELDS_MAPPING);
  return new SessionTokenV1(row, db);
}

const AUTH_SESSION_FIELDS = {
  uid: 'id',
  user_id: 'userId',
  issue: 'issue',
  status: 'status',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
  last_used_at: 'lastUsedAt',
  last_ip: 'lastIP',
  last_user_agent: 'lastUserAgent',
  database_time: 'databaseTime',
};

const AUTH_SESSION_FIELDS_MAPPING = {};

const AUTH_SESSION_COLUMNS = {
  id: 'uid',
  userId: 'user_id',
  issue: 'issue',
  status: 'status',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  lastUsedAt: 'last_used_at',
  lastIP: 'last_ip',
  lastUserAgent: 'last_user_agent',
};

const AUTH_SESSION_COLUMNS_MAPPING = {};

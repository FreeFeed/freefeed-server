import { AppTokenV1 } from '../../models';

import { prepareModelPayload, initObject } from './utils';


const appTokensTrait = (superClass) => class extends superClass {
  async createAppToken(payload) {
    const preparedPayload = prepareModelPayload(payload, APP_TOKEN_COLUMNS, APP_TOKEN_COLUMNS_MAPPING);
    const [id] = await this.database('app_tokens').returning('uid').insert(preparedPayload);
    return id;
  }

  async getAppTokenById(uid) {
    const row = await this.database('app_tokens').first().where({ uid })
    return initAppTokenObject(row);
  }

  async getActiveAppTokenByIdAndIssue(uid, issue) {
    const row = await this.database('app_tokens').first().where({ uid, issue, is_active: true })
    return initAppTokenObject(row);
  }

  async registerAppTokenUsage(id, { ip, userAgent, debounce }) {
    const sql = `
      update app_tokens set 
        last_ip = :ip, last_user_agent = :userAgent, last_used_at = now()
      where
        uid = :id and (last_ip <> :ip or last_user_agent <> :userAgent or last_used_at is null or last_used_at < now() - :debounce::interval)
    `;
    await this.database.raw(sql, { id, ip, userAgent, debounce });
  }

  updateAppToken(id, payload) {
    const preparedPayload = prepareModelPayload(payload, APP_TOKEN_COLUMNS, APP_TOKEN_COLUMNS_MAPPING);
    preparedPayload['updated_at'] = 'now';
    return this.database('app_tokens').where('uid', id).update(preparedPayload);
  }

  async logAppTokenRequest(payload) {
    await this.database('app_tokens_log').insert(payload);
  }

  async reissueAppToken(id) {
    const { rows } = await this.database.raw(
      `update app_tokens set issue = issue + 1, updated_at = default where uid = :id returning issue`,
      { id },
    );

    if (rows.length === 0) {
      throw new Error(`cannot find app token ${id}`);
    }

    return rows[0].issue;
  }

  async listActiveAppTokens(userId) {
    const { rows } = await this.database.raw(`select * from app_tokens where user_id = :userId and is_active order by created_at desc`, { userId });
    return rows.map((r) => initAppTokenObject(r));
  }

  async deleteAppToken(id) {
    await this.database.raw(`delete from app_tokens where uid = :id`, { id });
  }
};

export default appTokensTrait;

/////////////////////////////

function initAppTokenObject(row) {
  if (!row) {
    return null;
  }

  row = prepareModelPayload(row, APP_TOKEN_FIELDS, APP_TOKEN_FIELDS_MAPPING);
  return initObject(AppTokenV1, row, row.id);
}

const APP_TOKEN_FIELDS = {
  uid:             'id',
  user_id:         'userId',
  title:           'title',
  is_active:       'isActive',
  issue:           'issue',
  created_at:      'createdAt',
  updated_at:      'updatedAt',
  scopes:          'scopes',
  restrictions:    'restrictions',
  last_used_at:    'lastUsedAt',
  last_ip:         'lastIP',
  last_user_agent: 'lastUserAgent',
};

const APP_TOKEN_FIELDS_MAPPING = {
  created_at:   (time) =>  time ? time.toISOString() : undefined,
  updated_at:   (time) =>  time ? time.toISOString() : undefined,
  last_used_at: (time) =>  time ? time.toISOString() : null,
};

const APP_TOKEN_COLUMNS = {
  id:            'uid',
  userId:        'user_id',
  title:         'title',
  isActive:      'is_active',
  issue:         'issue',
  createdAt:     'created_at',
  updatedAt:     'updated_at',
  scopes:        'scopes',
  restrictions:  'restrictions',
  lastUsedAt:    'last_used_at',
  lastIP:        'last_ip',
  lastUserAgent: 'last_user_agent',
};

const APP_TOKEN_COLUMNS_MAPPING = {
  createdAt:  (ts) => ts ? new Date(ts) : undefined,
  updatedAt:  (ts) => ts ? new Date(ts) : undefined,
  lastUsedAt: (ts) => ts ? new Date(ts) : null,
};

import { AppTokenV1 } from '../../models/auth-tokens';

import { prepareModelPayload } from './utils';


const appTokensTrait = (superClass) => class extends superClass {
  async createAppToken(payload) {
    const preparedPayload = prepareModelPayload(
      {
        isActive: true, // override app_tokens table default
        ...payload
      },
      APP_TOKEN_COLUMNS,
      APP_TOKEN_COLUMNS_MAPPING,
    );

    preparedPayload.activation_code = AppTokenV1.createActivationCode();

    if (Number.isFinite(payload.expiresAtSeconds)) {
      preparedPayload.expires_at = this.database.raw(`now() + ? * '1 second'::interval`, payload.expiresAtSeconds);
    }

    const [row] = await this.database('app_tokens').insert(preparedPayload).returning('*');
    const token = initAppTokenObject(row, this);

    return token;
  }

  async getAppTokenById(uid) {
    const row = await this.database('app_tokens').first().where({ uid });
    return initAppTokenObject(row, this);
  }

  async getActiveAppTokenByIdAndIssue(uid, issue) {
    const row = await this.database.getRow(
      `select * from app_tokens where 
          uid = :uid 
          and issue = :issue
          and is_active
          and (expires_at is null or expires_at > now())`,
      { uid, issue });
    return initAppTokenObject(row, this);
  }

  async getAppTokenByActivationCode(code, codeTTL) {
    const row = await this.database.getRow(
      `select * from app_tokens where 
          activation_code = :code 
          and updated_at > now() - :codeTTL * '1 second'::interval
          and is_active
          and (expires_at is null or expires_at > now())
        order by updated_at
        limit 1`,
      { code, codeTTL });
    return initAppTokenObject(row, this);
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

  async updateAppToken(id, payload) {
    const preparedPayload = prepareModelPayload(payload, APP_TOKEN_COLUMNS, APP_TOKEN_COLUMNS_MAPPING);
    preparedPayload['updated_at'] = 'now';
    const [row] = await this.database('app_tokens').where('uid', id).update(preparedPayload).returning('*');

    if (!row) {
      throw new Error(`cannot find app token ${id}`);
    }

    return initAppTokenObject(row, this);
  }

  async logAppTokenRequest(payload) {
    await this.database('app_tokens_log').insert(payload);
  }

  async reissueAppToken(id) {
    const activationCode = AppTokenV1.createActivationCode();
    const row = await this.database.getRow(
      `update app_tokens set 
        issue = issue + 1,
        updated_at = default,
        activation_code = :activationCode
        where uid = :id returning *`,
      { id, activationCode },
    );

    if (!row) {
      throw new Error(`cannot find app token ${id}`);
    }

    return initAppTokenObject(row, this);
  }

  async listActiveAppTokens(userId) {
    const rows = await this.database.getAll(
      `select * from app_tokens where 
         user_id = :userId 
         and is_active 
         and (expires_at is null or expires_at > now())
         order by created_at desc`,
      { userId });
    return rows.map((r) => initAppTokenObject(r, this));
  }

  async deleteAppToken(id) {
    await this.database.raw(`delete from app_tokens where uid = :id`, { id });
  }

  async periodicInvalidateAppTokens() {
    await this.database.raw(
      `update app_tokens set
        is_active = false, updated_at = now()
        where
        is_active and expires_at <= now()`
    );
  }
};

export default appTokensTrait;

/////////////////////////////

function initAppTokenObject(row, db) {
  if (!row) {
    return null;
  }

  row = prepareModelPayload(row, APP_TOKEN_FIELDS, APP_TOKEN_FIELDS_MAPPING);
  return new AppTokenV1(row, db);
}

const APP_TOKEN_FIELDS = {
  uid:             'id',
  user_id:         'userId',
  title:           'title',
  is_active:       'isActive',
  issue:           'issue',
  created_at:      'createdAt',
  updated_at:      'updatedAt',
  expires_at:      'expiresAt',
  scopes:          'scopes',
  restrictions:    'restrictions',
  last_used_at:    'lastUsedAt',
  last_ip:         'lastIP',
  last_user_agent: 'lastUserAgent',
  activation_code: 'activationCode',
};

const APP_TOKEN_FIELDS_MAPPING = {};

const APP_TOKEN_COLUMNS = {
  id:             'uid',
  userId:         'user_id',
  title:          'title',
  isActive:       'is_active',
  issue:          'issue',
  createdAt:      'created_at',
  updatedAt:      'updated_at',
  expiresAt:      'expires_at',
  scopes:         'scopes',
  restrictions:   'restrictions',
  lastUsedAt:     'last_used_at',
  lastIP:         'last_ip',
  lastUserAgent:  'last_user_agent',
  activationCode: 'activation_code',
};

const APP_TOKEN_COLUMNS_MAPPING = {};

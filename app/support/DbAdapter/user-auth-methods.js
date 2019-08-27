import { prepareModelPayload } from './utils';


const userAuthMethodsTrait = (superClass) => class extends superClass {
  async addUserAuthMethod(providerName, userId, profile) {
    await this.database('user_auth_methods')
      .insert({
        user_id:       userId,
        provider_id:   profile.id,
        provider_name: providerName,
        profile,
      });
  }

  async updateUserAuthMethod(providerName, providerId, attrs) {
    const updatedAt = new Date().getTime();
    await this.database('user_auth_methods')
      .where({ provider_id: providerId, provider_name: providerName })
      .update(prepareModelPayload({ updatedAt, ...attrs }, AUTH_METHOD_COLUMNS, AUTH_METHOD_COLUMNS_MAPPING));
  }

  async removeUserAuthMethod(providerName, providerId, userId) {
    await this.database('user_auth_methods')
      .where({ provider_id: providerId, provider_name: providerName, user_id: userId })
      .del();
  }

  async getUserAuthMethod(query) {
    const attrs = await this.database('user_auth_methods')
      .where(prepareModelPayload(query, AUTH_METHOD_COLUMNS, AUTH_METHOD_COLUMNS_MAPPING))
      .first();

    if (!attrs) {
      return undefined;
    }

    return prepareModelPayload(attrs, AUTH_METHOD_FIELDS, AUTH_METHOD_FIELDS_MAPPING);
  }

  async getUserAuthMethods(query) {
    const attrs = prepareModelPayload(query, AUTH_METHOD_COLUMNS, AUTH_METHOD_COLUMNS_MAPPING);
    const authMethods = await this.database('user_auth_methods')
      .where(attrs);

    return authMethods.map((method) => (
      prepareModelPayload(method, AUTH_METHOD_FIELDS, AUTH_METHOD_FIELDS_MAPPING)
    ));
  }
};

export default userAuthMethodsTrait;

///////////////////////////////////////////////////

const AUTH_METHOD_COLUMNS = {
  intId:        'id',
  providerId:   'provider_id',
  providerName: 'provider_name',
  accessToken:  'access_token',
  profile:      'profile',
  userId:       'user_id',
  createdAt:    'created_at',
  updatedAt:    'updated_at',
};

const AUTH_METHOD_COLUMNS_MAPPING = {
  createdAt: (timestamp) => {
    const d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  },
  updatedAt: (timestamp) => {
    const d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  },
};

const AUTH_METHOD_FIELDS = {
  intId:         'id',
  provider_id:   'providerId',
  provider_name: 'providerName',
  access_token:  'accessToken',
  profile:       'profile',
  user_id:       'userId',
  created_at:    'createdAt',
  updated_at:    'updatedAt',
};

const AUTH_METHOD_FIELDS_MAPPING = {
  created_at: (time) => { return time.getTime().toString() },
  updated_at: (time) => { return time.getTime().toString() },
};

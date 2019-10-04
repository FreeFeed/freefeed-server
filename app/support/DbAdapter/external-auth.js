import { prepareModelPayload } from './utils';

///////////////////////////////////////////////////
// External authentication
///////////////////////////////////////////////////

const externalAuthTrait = (superClass) => class extends superClass {
  async getExtProfiles(userId) {
    const { rows } = await this.database.raw(
      `select * from external_auth where user_id = :userId order by created_at desc`,
      { userId }
    );
    return rows.map((row) => prepareModelPayload(row, EXT_PROFILE_FIELDS, EXT_PROFILE_FIELDS_MAPPING));
  }

  async addOrUpdateExtProfile({ userId, provider, externalId, title }) {
    const { rows } = await this.database.raw(
      `insert into external_auth (user_id, provider, external_id, title) values (:userId, :provider, :externalId, :title)
      on conflict (provider, external_id) do update set title = excluded.title where external_auth.user_id = excluded.user_id
      returning *
      `,
      { userId, provider, externalId, title }
    );

    if (rows.length === 0) {
      // Only if this profile is already belongs to another user
      return null;
    }

    return prepareModelPayload(rows[0], EXT_PROFILE_FIELDS, EXT_PROFILE_FIELDS_MAPPING);
  }

  /**
   * Removes external profile from user account
   *
   * @param {uuid} userId
   * @param {uuid} profileId
   * @returns {boolean} true if profile was removed, false if not found for this user
   */
  async removeExtProfile(userId, profileId) {
    const { rows } = await this.database.raw(
      `delete from external_auth where uid = :profileId and user_id = :userId returning uid`,
      { userId, profileId }
    );

    return rows.length > 0;
  }
};

export default externalAuthTrait;

const EXT_PROFILE_FIELDS = {
  uid:         'id',
  user_id:     'userId',
  provider:    'provider',
  external_id: 'externalId',
  title:       'title',
  created_at:  'createdAt',
};

const EXT_PROFILE_FIELDS_MAPPING = {
  //
  created_at: (time) => { return time.toISOString() }
};

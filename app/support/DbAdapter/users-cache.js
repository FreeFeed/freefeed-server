import _ from 'lodash';

///////////////////////////////////////////////////
// User's attributes caching
///////////////////////////////////////////////////

const usersCacheTrait = (superClass) => class extends superClass {
  async cacheFlushUser(id) {
    const cacheKey = `user_${id}`
    await this.cache.delAsync(cacheKey)
  }

  getCachedUserAttrs = async (id) => {
    return fixCachedUserAttrs(await this.cache.get(`user_${id}`))
  };

  async fetchUser(id) {
    let attrs = await this.getCachedUserAttrs(id);

    if (!attrs) {
      // Cache miss, read from the database
      attrs = await this.database('users').first().where('uid', id) || null;

      if (attrs) {
        await this.cache.set(`user_${id}`, attrs);
      }
    }

    return attrs;
  }

  /**
   * Returns plain object with ids as keys and user attributes as values
   */
  async fetchUsersAssoc(ids) {
    const idToUser = {};

    if (_.isEmpty(ids)) {
      return idToUser;
    }

    const uniqIds = _.uniq(ids);
    let cachedUsers;

    if (this.cache.store.name === 'redis') {
      const { client, done } = await this.cache.store.getClient();

      try {
        const cacheKeys = ids.map((id) => `user_${id}`);
        const result = await client.mgetAsync(cacheKeys);
        cachedUsers = result.map((x) => x ? JSON.parse(x) : null).map(fixCachedUserAttrs);
      } finally {
        done();
      }
    } else {
      cachedUsers = await Promise.all(uniqIds.map(this.getCachedUserAttrs));
    }

    const notFoundIds = _.compact(cachedUsers.map((attrs, i) => attrs ? null : uniqIds[i]));
    const dbUsers = notFoundIds.length === 0 ? [] : await this.database('users').whereIn('uid', notFoundIds);

    await Promise.all(dbUsers.map((attrs) => this.cache.set(`user_${attrs.uid}`, attrs)));

    _.compact(cachedUsers).forEach((attrs) => idToUser[attrs.uid] = attrs);
    dbUsers.forEach((attrs) => idToUser[attrs.uid] = attrs);
    return idToUser;
  }

  async fetchUsers(ids) {
    const idToUser = await this.fetchUsersAssoc(ids);
    return ids.map((id) => idToUser[id] || null);
  }
};

export default usersCacheTrait;

///////////////////////////////////////////////////

function fixDateType(date) {
  if (_.isString(date)) {
    return new Date(date);
  }

  if (_.isDate(date)) {
    return date;
  }

  return null;
}

function fixCachedUserAttrs(attrs) {
  if (!attrs) {
    return null;
  }

  // Convert dates back to the Date type
  attrs['created_at'] = fixDateType(attrs['created_at']);
  attrs['updated_at'] = fixDateType(attrs['updated_at']);
  attrs['gone_at'] = fixDateType(attrs['gone_at']);
  attrs['reset_password_sent_at'] = fixDateType(attrs['reset_password_sent_at']);
  attrs['reset_password_expires_at'] = fixDateType(attrs['reset_password_expires_at']);
  return attrs;
}

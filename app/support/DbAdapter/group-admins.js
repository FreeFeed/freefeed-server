import pgFormat from 'pg-format';

///////////////////////////////////////////////////
// Group administrators
///////////////////////////////////////////////////

const groupAdminTrait = (superClass) => class extends superClass {
  getGroupAdministratorsIds(groupId) {
    return this.database('group_admins').pluck('user_id').orderBy('created_at', 'desc').where('group_id', groupId)
  }

  /**
   * Finds groups in given groupIds and returns plain object { [uuid]: boolean }
   *
   * Key is the group UID and 'true' value means that the viewer has access to
   * this group i.e. one of following conditions is true:
   *  - group is public
   *  - group is protected and viewer is not anonymous
   *  - group is private and viewer is subscriber of the group
   *
   * The returning object has only groups UIDs. Users UIDs in 'groupIds'
   * argument are discards.
   */
  async getGroupsVisibility(groupIds, viewerId = null) {
    if (groupIds.length === 0) {
      return {};
    }

    let allGroups = [];

    if (!viewerId) {
    // Public groups only
      ({ rows: allGroups } = await this.database.raw(
        pgFormat(
          `select
          uid,
          (not is_protected) as visible
         from
          users
         where
          type = 'group' and uid in (%L)`,
          groupIds,
        ),
      ));
    } else {
    // Non-private groups and private groups where viewer is member
      ({ rows: allGroups } = await this.database.raw(
        pgFormat(
          `select
          g.uid,
          (not g.is_private or s.user_id is not null) as visible
         from 
          users g
          join feeds f on f.user_id = g.uid and f.name = 'Posts'
          left join subscriptions s on s.feed_id = f.uid and s.user_id = %L
         where 
          g.type = 'group' and g.uid in (%L)`,
          viewerId, groupIds,
        ),
      ));
    }

    const result = {};

    for (const { uid, visible } of allGroups) {
      result[uid] = visible;
    }

    return result;
  }

  /**
   * Returns plain object with group UIDs as keys and arrays of admin UIDs as values
   */
  async getGroupsAdministratorsIds(groupIds, viewerId = null) {
    const result = {};

    if (groupIds.length === 0) {
      return result;
    }

    const groupsVisibility = await this.getGroupsVisibility(groupIds, viewerId);
    const visibleGroups = [];

    for (const uid of Object.keys(groupsVisibility)) {
      result[uid] = [];

      if (groupsVisibility[uid]) {
        visibleGroups.push(uid);
      }
    }

    if (visibleGroups.length > 0) {
      const rows = await this.database.select('group_id', 'user_id').from('group_admins').where('group_id', 'in', visibleGroups);

      for (const { group_id, user_id } of rows) {
        result[group_id].push(user_id);
      }
    }

    return result;
  }

  async isUserAdminOfGroup(userId, groupId) {
    const { rows } = await this.database.raw(
      'select 1 from group_admins where group_id = :groupId and user_id = :userId',
      { userId, groupId }
    )
    return rows.length > 0;
  }

  addAdministratorToGroup(groupId, adminId) {
    const currentTime = new Date().toISOString()

    const payload = {
      user_id:    adminId,
      group_id:   groupId,
      created_at: currentTime
    }

    return this.database('group_admins').returning('id').insert(payload)
  }

  removeAdministratorFromGroup(groupId, adminId) {
    return this.database('group_admins').where({
      user_id:  adminId,
      group_id: groupId
    }).delete()
  }

  getManagedGroupIds(userId) {
    return this.database('group_admins').pluck('group_id').orderBy('created_at', 'desc').where('user_id', userId);
  }

  /**
   * Returns plain object with group UIDs as keys and arrays of requester's UIDs as values
   */
  async getPendingGroupRequests(groupsAdminId) {
    const rows = await this.database.select('r.from_user_id as user_id', 'r.to_user_id as group_id')
      .from('subscription_requests as r')
      .innerJoin('group_admins as a', 'a.group_id', 'r.to_user_id')
      .innerJoin('users as u', 'u.uid', 'r.from_user_id')
      .where({ 'a.user_id': groupsAdminId })
      .whereNull('u.gone_status');

    const res = {};
    rows.forEach(({ group_id, user_id }) => {
      if (!res.hasOwnProperty(group_id)) {
        res[group_id] = [];
      }

      res[group_id].push(user_id);
    });
    return res;
  }
};

export default groupAdminTrait;

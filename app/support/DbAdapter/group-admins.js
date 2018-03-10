///////////////////////////////////////////////////
// Group administrators
///////////////////////////////////////////////////

const groupAdminTrait = (superClass) => class extends superClass {
  getGroupAdministratorsIds(groupId) {
    return this.database('group_admins').pluck('user_id').orderBy('created_at', 'desc').where('group_id', groupId)
  }

  /**
   * Returns plain object with group UIDs as keys and arrays of admin UIDs as values
   */
  async getGroupsAdministratorsIds(groupIds) {
    const rows = await this.database.select('group_id', 'user_id').from('group_admins').where('group_id', 'in', groupIds);
    const res = {};
    rows.forEach(({ group_id, user_id }) => {
      if (!res.hasOwnProperty(group_id)) {
        res[group_id] = [];
      }
      res[group_id].push(user_id);
    });
    return res;
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

  async userHavePendingGroupRequests(userId) {
    const res = await this.database.first('r.id')
      .from('subscription_requests as r')
      .innerJoin('group_admins as a', 'a.group_id', 'r.to_user_id')
      .where({ 'a.user_id': userId })
      .limit(1);
    return !!res;
  }

  /**
   * Returns plain object with group UIDs as keys and arrays of requester's UIDs as values
   */
  async getPendingGroupRequests(groupsAdminId) {
    const rows = await this.database.select('r.from_user_id as user_id', 'r.to_user_id as group_id')
      .from('subscription_requests as r')
      .innerJoin('group_admins as a', 'a.group_id', 'r.to_user_id')
      .where({ 'a.user_id': groupsAdminId });

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

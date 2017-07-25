///////////////////////////////////////////////////
// Bans
///////////////////////////////////////////////////

const bansTrait = (superClass) => class extends superClass {
  async getUserBansIds(userId) {
    const res = await this.database('bans').select('banned_user_id').orderBy('created_at', 'desc').where('user_id', userId);
    return res.map((record) => record.banned_user_id);
  }

  async getUserIdsWhoBannedUser(userId) {
    const res = await this.database('bans').select('user_id').orderBy('created_at', 'desc').where('banned_user_id', userId);
    return res.map((record) => record.user_id);
  }

  async getBannedFeedsIntIds(userId) {
    return await this.database
      .pluck('feeds.id')
      .from('feeds')
      .innerJoin('bans', 'bans.banned_user_id', 'feeds.user_id')
      .where('feeds.name', 'Posts')
      .where('bans.user_id', userId);
  }

  async getBanMatrixByUsersForPostReader(bannersUserIds, targetUserId) {
    let res = [];

    if (targetUserId) {
      res = await this.database('bans')
        .where('banned_user_id', targetUserId)
        .where('user_id', 'in', bannersUserIds)
        .orderByRaw(`position(user_id::text in '${bannersUserIds.toString()}')`)
    }

    const matrix = bannersUserIds.map((id) => {
      const foundBan = res.find((record) => record.user_id == id);
      return foundBan ? [id, true] : [id, false];
    });

    return matrix
  }

  createUserBan(currentUserId, bannedUserId) {
    const currentTime = new Date().toISOString()

    const payload = {
      user_id:        currentUserId,
      banned_user_id: bannedUserId,
      created_at:     currentTime
    }

    return this.database('bans').returning('id').insert(payload)
  }

  deleteUserBan(currentUserId, bannedUserId) {
    return this.database('bans').where({
      user_id:        currentUserId,
      banned_user_id: bannedUserId
    }).delete()
  }
};

export default bansTrait;

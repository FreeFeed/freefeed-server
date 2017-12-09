///////////////////////////////////////////////////
// Local Bumps
///////////////////////////////////////////////////

const localBumpsTrait = (superClass) => class extends superClass {
  /**
   * Set local bumps for given post and users
   * 
   * @param {string} postId
   * @param {string[]} userIds
   */
  async setLocalBumpForUsers(postId, userIds) {
    if (userIds.length === 0) {
      return;
    }
    // Insert multiple rows from array at once
    await this.database.raw(
      `insert into local_bumps (post_id, user_id) 
         select :postId, x from unnest(:userIds::uuid[]) x on conflict do nothing`,
      { postId, userIds }
    );
  }

  async getUserLocalBumps(userId, newerThan) {
    const time = new Date()
    if (newerThan) {
      time.setTime(newerThan)
    }

    const res = await this.database('local_bumps').orderBy('created_at', 'desc').where('user_id', userId).where('created_at', '>', time.toISOString())
    const bumps = res.map((record) => {
      return {
        postId:   record.post_id,
        bumpedAt: record.created_at.getTime()
      }
    })
    return bumps
  }
};

export default localBumpsTrait;

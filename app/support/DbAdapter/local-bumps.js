///////////////////////////////////////////////////
// Local Bumps
///////////////////////////////////////////////////

const localBumpsTrait = (superClass) => class extends superClass {
  async createLocalBump(postId, userId) {
    const existingPostLocalBumps = await this.database('local_bumps').where({
      post_id: postId,
      user_id: userId
    }).count()
    if (parseInt(existingPostLocalBumps[0].count) > 0) {
      return true
    }

    const payload = {
      post_id: postId,
      user_id: userId
    }

    return this.database('local_bumps').returning('id').insert(payload)
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

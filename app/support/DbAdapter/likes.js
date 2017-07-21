///////////////////////////////////////////////////
// Likes
///////////////////////////////////////////////////

const likesTrait = (superClass) => class extends superClass {
  createUserPostLike(postId, userId) {
    const currentTime = new Date().toISOString()

    const payload = {
      post_id:    postId,
      user_id:    userId,
      created_at: currentTime
    }

    return this.database('likes').returning('id').insert(payload)
  }

  async getPostLikesCount(postId) {
    const res = await this.database('likes').where({ post_id: postId }).count()
    return parseInt(res[0].count)
  }

  async getUserLikesCount(userId) {
    const res = await this.database('likes').where({ user_id: userId }).count()
    return parseInt(res[0].count)
  }

  async getPostLikersIdsWithoutBannedUsers(postId, viewerUserId) {
    let query = this.database('likes').select('user_id').orderBy('created_at', 'desc').where('post_id', postId);

    if (viewerUserId) {
      const subquery = this.database('bans').select('banned_user_id').where('user_id', viewerUserId)
      query = query.where('user_id', 'not in', subquery)
    }

    const res = await query;

    const userIds = res.map((record) => record.user_id)
    return userIds
  }

  async hasUserLikedPost(userId, postId) {
    const res = await this.database('likes').where({
      post_id: postId,
      user_id: userId
    }).count()
    return parseInt(res[0].count) != 0
  }

  async getUserPostLikedTime(userId, postId) {
    const res = await this.database('likes').select('created_at').where({
      post_id: postId,
      user_id: userId
    })
    const record = res[0]

    if (!record) {
      return null
    }
    return record.created_at.getTime()
  }

  removeUserPostLike(postId, userId) {
    return this.database('likes').where({
      post_id: postId,
      user_id: userId
    }).delete()
  }

  _deletePostLikes(postId) {
    return this.database('likes').where({ post_id: postId }).delete()
  }
};

export default likesTrait;

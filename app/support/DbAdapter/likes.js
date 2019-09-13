///////////////////////////////////////////////////
// Likes
///////////////////////////////////////////////////

const likesTrait = (superClass) =>
  class extends superClass {
    async getPostLikesCount(postId) {
      const res = await this.database('likes')
        .where({ post_id: postId })
        .count();
      return parseInt(res[0].count);
    }

    async getUserLikesCount(userId) {
      const res = await this.database('likes')
        .where({ user_id: userId })
        .count();
      return parseInt(res[0].count);
    }

    async getPostLikersIdsWithoutBannedUsers(postId, viewerUserId) {
      let query = this.database('likes')
        .select('user_id')
        .orderBy('created_at', 'desc')
        .where('post_id', postId);

      if (viewerUserId) {
        const subquery = this.database('bans')
          .select('banned_user_id')
          .where('user_id', viewerUserId);
        query = query.where('user_id', 'not in', subquery);
      }

      const res = await query;

      const userIds = res.map((record) => record.user_id);
      return userIds;
    }

    _deletePostLikes(postId) {
      return this.database('likes')
        .where({ post_id: postId })
        .delete();
    }

    /**
     * Likes post and returns true on success or false if this
     * post was already liked by this user
     *
     * @param {string} postId
     * @param {string} userId
     * @returns {boolean}
     */
    async likePost(postId, userId) {
      const { rows } = await this.database.raw(
        `insert into likes (post_id, user_id) values (:postId, :userId) on conflict do nothing returning user_id`,
        { postId, userId },
      );
      return rows.length > 0;
    }

    /**
     * Unlikes post and returns true on success or false if this
     * post was not liked by this user
     *
     * @param {string} postId
     * @param {string} userId
     * @returns {boolean}
     */
    async unlikePost(postId, userId) {
      const { rows } = await this.database.raw(
        `delete from likes where (post_id, user_id) = (:postId, :userId) returning 1`,
        { postId, userId },
      );
      return rows.length > 0;
    }
  };

export default likesTrait;

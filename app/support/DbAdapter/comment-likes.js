import _ from 'lodash';
import pgFormat from 'pg-format';

import { unexistedUID } from './utils';

///////////////////////////////////////////////////
// Comment likes
///////////////////////////////////////////////////

const commentLikesTrait = (superClass) => class extends superClass {
  async createCommentLike(commentUUID, likerUUID) {
    const [commentId, userId] = await this._getCommentAndUserIntId(commentUUID, likerUUID);

    const payload = {
      comment_id: commentId,
      user_id:    userId
    };

    await this.database('comment_likes').insert(payload);
    return this.getCommentLikesWithoutBannedUsers(commentId, likerUUID);
  }

  async _getCommentAndUserIntId(commentUUID, likerUUID) {
    const [commentId, userId] = await Promise.all([
      this._getCommentIntIdByUUID(commentUUID),
      this._getUserIntIdByUUID(likerUUID),
    ]);

    return [commentId, userId];
  }

  async getCommentLikesWithoutBannedUsers(commentIntId, viewerUserUUID = null) {
    let query = this.database
      .select('users.uid as userId', 'comment_likes.created_at as createdAt')
      .from('comment_likes')
      .innerJoin('users', 'users.id', 'comment_likes.user_id')
      .orderBy('comment_likes.created_at', 'desc')
      .where('comment_likes.comment_id', commentIntId);

    if (viewerUserUUID) {
      const subquery = this.database('bans').select('banned_user_id').where('user_id', viewerUserUUID);
      query = query.where('users.uid', 'not in', subquery);
    }
    let commentLikesData = await query;

    if (viewerUserUUID) {
      commentLikesData = commentLikesData.sort((a, b) => {
        if (a.userId == viewerUserUUID)
          return -1;
        if (b.userId == viewerUserUUID)
          return 1;
        return 0;
      });
    }
    return commentLikesData;
  }

  async hasUserLikedComment(commentUUID, userUUID) {
    const [commentId, userId] = await this._getCommentAndUserIntId(commentUUID, userUUID);
    const [{ 'count': res }] = await this.database('comment_likes').where({
      comment_id: commentId,
      user_id:    userId
    }).count();
    return parseInt(res) != 0;
  }

  async deleteCommentLike(commentUUID, likerUUID) {
    const [commentId, userId] = await this._getCommentAndUserIntId(commentUUID, likerUUID);

    await this.database('comment_likes').where({
      comment_id: commentId,
      user_id:    userId
    }).delete();
    return this.getCommentLikesWithoutBannedUsers(commentId, likerUUID);
  }

  async getLikesInfoForComments(commentsUUIDs, viewerUUID) {
    if (_.isEmpty(commentsUUIDs)) {
      return [];
    }

    const bannedUsersIds = viewerUUID ? await this.getUserBansIds(viewerUUID) : [];
    const viewerIntId = viewerUUID ? await this._getUserIntIdByUUID(viewerUUID) : null;

    if (bannedUsersIds.length === 0) {
      bannedUsersIds.push(unexistedUID);
    }

    const commentLikesSQL = pgFormat(`
      select uid,
            (select coalesce(count(*), '0') from comment_likes cl
              where cl.comment_id = comments.id
                and cl.user_id not in (select id from users where uid in (%L))
            ) as c_likes,
            (select count(*) = 1 from comment_likes cl
              where cl.comment_id = comments.id
                and cl.user_id = %L
            ) as has_own_like
      from comments
      where uid in (%L) and user_id not in (%L)`,
      bannedUsersIds, viewerIntId, commentsUUIDs, bannedUsersIds
    );

    const { 'rows': commentLikes } = await this.database.raw(commentLikesSQL);
    return commentLikes;
  }

  async getLikesInfoForPosts(postsUUIDs, viewerUUID) {
    if (_.isEmpty(postsUUIDs)) {
      return [];
    }

    const bannedUsersIds = viewerUUID ? await this.getUserBansIds(viewerUUID) : [];
    const viewerIntId = viewerUUID ? await this._getUserIntIdByUUID(viewerUUID) : null;

    if (bannedUsersIds.length === 0) {
      bannedUsersIds.push(unexistedUID);
    }

    const commentLikesSQL = pgFormat(`
      select  p.uid,
              (select count(cl.*)
                from comment_likes cl join comments c
                  on c.id = cl.comment_id
                where c.post_id = p.uid and
                      c.user_id not in (%L) and
                      cl.user_id not in (select id from users where uid in (%L))
              ) as post_c_likes_count,
              (select count(cl.*)
                from comment_likes cl join comments c
                  on c.id = cl.comment_id
                where c.post_id = p.uid and
                      c.user_id not in (%L) and
                      cl.user_id = %L
              ) as own_c_likes_count
        from
          posts p
        where p.uid in (%L)`,
      bannedUsersIds, bannedUsersIds, bannedUsersIds, viewerIntId, postsUUIDs);

    const { 'rows': postsCommentLikes } = await this.database.raw(commentLikesSQL);
    return postsCommentLikes;
  }
};

export default commentLikesTrait;

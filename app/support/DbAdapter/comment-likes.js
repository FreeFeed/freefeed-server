import _ from 'lodash';
import pgFormat from 'pg-format';

import { sqlIn } from './utils';

///////////////////////////////////////////////////
// Comment likes
///////////////////////////////////////////////////

const commentLikesTrait = (superClass) =>
  class extends superClass {
    /**
     * Returns true if like is created or false if like is already exists
     *
     * @param {string} commentUUID
     * @param {string} likerUUID
     * @returns {Promise<boolean>}
     */
    async createCommentLike(commentUUID, likerUUID) {
      const [commentId, userId] = await this._getCommentAndUserIntId(commentUUID, likerUUID);
      const ok = await this.database.getOne(
        `insert into comment_likes 
        (comment_id, user_id) values (:commentId, :userId)
        on conflict do nothing
        returning true`,
        { commentId, userId },
      );
      return !!ok;
    }

    async _getCommentAndUserIntId(commentUUID, likerUUID) {
      const [commentId, userId] = await Promise.all([
        this._getCommentIntIdByUUID(commentUUID),
        this._getUserIntIdByUUID(likerUUID),
      ]);

      return [commentId, userId];
    }

    async getCommentLikesWithoutBannedUsers(commentIntId, viewerId = null) {
      const notBannedSQLFabric = await this.notBannedActionsSQLFabric(viewerId);

      return (
        this.database
          .getAll(
            `select u.uid as user_id, cl.created_at as created_at
        from
          comment_likes cl
          join users u on u.id = cl.user_id
          join comments c on c.id = cl.comment_id
          join posts p on c.post_id = p.uid
        where
          cl.comment_id = :commentIntId
          and ${notBannedSQLFabric('cl', 'p', true)}
          and u.gone_status is null
        order by
          u.uid = :viewerId desc,
          cl.created_at desc`,
            { commentIntId, viewerId },
          )
          // Convert result keys to camelCase
          .then((rows) => rows.map((r) => _.mapKeys(r, (_v, k) => _.camelCase(k))))
      );
    }

    async hasUserLikedComment(commentUUID, userUUID) {
      const [commentId, userId] = await this._getCommentAndUserIntId(commentUUID, userUUID);
      const [{ count: res }] = await this.database('comment_likes')
        .where({
          comment_id: commentId,
          user_id: userId,
        })
        .count();
      return parseInt(res) != 0;
    }

    async deleteCommentLike(commentUUID, likerUUID) {
      const [commentId, userId] = await this._getCommentAndUserIntId(commentUUID, likerUUID);
      const ok = await this.database.getOne(
        `delete from comment_likes
        where (comment_id, user_id) = (:commentId, :userId)
        returning true`,
        { commentId, userId },
      );
      return !!ok;
    }

    async getLikesInfoForComments(commentsUUIDs, viewerUUID) {
      if (_.isEmpty(commentsUUIDs)) {
        return [];
      }

      const viewerIntId = viewerUUID ? await this._getUserIntIdByUUID(viewerUUID) : null;
      const notBannedSQLFabric = await this.notBannedActionsSQLFabric(viewerUUID);

      const commentLikesSQL = pgFormat(
        `select c.uid,
            (select coalesce(count(*), '0') from comment_likes cl
              join users u on cl.user_id = u.id
              where cl.comment_id = c.id
                and ${notBannedSQLFabric('cl', 'p', true)}
                and u.gone_status is null
            ) as c_likes,
            (select count(*) = 1 from comment_likes cl
              where cl.comment_id = c.id
                and cl.user_id = %L
            ) as has_own_like
        from comments c join posts p on p.uid = c.post_id
        where ${sqlIn('c.uid', commentsUUIDs)} and ${notBannedSQLFabric('c')}`,
        viewerIntId,
      );

      const { rows: commentLikes } = await this.database.raw(commentLikesSQL);
      return commentLikes;
    }

    async getLikesInfoForPosts(postsUUIDs, viewerUUID) {
      if (_.isEmpty(postsUUIDs)) {
        return [];
      }

      const viewerIntId = viewerUUID ? await this._getUserIntIdByUUID(viewerUUID) : null;

      const notBannedSQLFabric = await this.notBannedActionsSQLFabric(viewerUUID);

      const commentLikesSQL = pgFormat(
        `select p.uid,
              (select count(cl.*)
                from comment_likes cl
                  join comments c on c.id = cl.comment_id
                  join users u on cl.user_id = u.id
                where 
                      c.post_id = p.uid 
                      and ${notBannedSQLFabric('c')}
                      and ${notBannedSQLFabric('cl', 'p', true)}
                      and u.gone_status is null
              ) as post_c_likes_count,
              (select count(cl.*)
                from comment_likes cl join comments c
                  on c.id = cl.comment_id
                where
                      c.post_id = p.uid
                      and ${notBannedSQLFabric('c')}
                      and cl.user_id = %L
              ) as own_c_likes_count
        from
          posts p
        where ${sqlIn('p.uid', postsUUIDs)}`,
        viewerIntId,
      );

      return await this.database.getAll(commentLikesSQL);
    }
  };

export default commentLikesTrait;

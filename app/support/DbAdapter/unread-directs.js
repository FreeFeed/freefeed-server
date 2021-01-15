///////////////////////////////////////////////////
// Unread directs counter
///////////////////////////////////////////////////

const unreadDirectsTrait = (superClass) =>
  class extends superClass {
    markAllDirectsAsRead(userId) {
      return this.database.raw(`update users set directs_read_at = now() where uid = :userId`, {
        userId,
      });
    }

    async getUnreadDirectsNumber(userId) {
      const [[directsFeedId], [directsReadAt]] = await Promise.all([
        this.database.pluck('id').from('feeds').where({ user_id: userId, name: 'Directs' }),
        this.database.pluck('directs_read_at').from('users').where({ uid: userId }),
      ]);

      /*
     Select posts from my Directs feed, created after the directs_read_at authored by
     users other than me and then add posts from my Directs feed, having comments created after the directs_read_at
     authored by users other than me
     */
      const sql = `
      select count(distinct unread.id) as cnt from (
        select id from 
          posts 
        where
          destination_feed_ids && :feeds
          and user_id != :userId
          and created_at > :directsReadAt
        union
        select p.id from
          comments c
          join posts p on p.uid = c.post_id
        where
          p.destination_feed_ids && :feeds
          and c.user_id != :userId
          and c.created_at > :directsReadAt
      ) as unread`;

      const res = await this.database.raw(sql, {
        feeds: `{${directsFeedId}}`,
        userId,
        directsReadAt,
      });
      return res.rows[0].cnt;
    }
  };

export default unreadDirectsTrait;

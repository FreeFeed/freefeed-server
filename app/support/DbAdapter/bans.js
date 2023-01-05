///////////////////////////////////////////////////
// Bans
///////////////////////////////////////////////////

const bansTrait = (superClass) =>
  class extends superClass {
    async getUserBansIds(userId) {
      const res = await this.database('bans')
        .select('banned_user_id')
        .orderBy('created_at', 'desc')
        .where('user_id', userId);
      return res.map((record) => record.banned_user_id);
    }

    /**
     * Returns Map.<userId, bannedUserIds>
     * @param {string[]} userIds
     * @return {Map.<string, string[]>}
     */
    async getUsersBansIdsMap(userIds) {
      const { rows } = await this.database.raw(
        `
      select user_id, array_agg(banned_user_id) as bans
      from bans where user_id = any(:userIds)
      group by user_id
      `,
        { userIds },
      );
      return new Map(rows.map((r) => [r.user_id, r.bans]));
    }

    async getUserIdsWhoBannedUser(userId) {
      const res = await this.database('bans')
        .select('user_id')
        .orderBy('created_at', 'desc')
        .where('banned_user_id', userId);
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

    async getFeedsIntIdsOfUsersWhoBannedViewer(viewerId) {
      return await this.database
        .pluck('feeds.id')
        .from('feeds')
        .innerJoin('bans', 'bans.user_id', 'feeds.user_id')
        .where('feeds.name', 'Posts')
        .where('bans.banned_user_id', viewerId);
    }

    async getBanMatrixByUsersForPostReader(bannersUserIds, targetUserId) {
      let res = [];

      if (targetUserId) {
        res = await this.database('bans')
          .where('banned_user_id', targetUserId)
          .where('user_id', 'in', bannersUserIds)
          .orderByRaw(`position(user_id::text in '${bannersUserIds.toString()}')`);
      }

      const matrix = bannersUserIds.map((id) => {
        const foundBan = res.find((record) => record.user_id == id);
        return foundBan ? [id, true] : [id, false];
      });

      return matrix;
    }

    /**
     * Returns uids of users who banned this user or was banned by this user.
     * It is useful for posts visibility check.
     * @param {String} userId   - UID of user
     * @return {Array.<String>} - UIDs of users
     */
    async getUsersBansOrWasBannedBy(userId) {
      const sql = `
      select
        distinct coalesce( nullif( user_id, :userId ), banned_user_id ) as id
      from
        bans 
      where
        user_id = :userId
        or banned_user_id = :userId
    `;
      const { rows } = await this.database.raw(sql, { userId });
      return rows.map((r) => r.id);
    }

    createUserBan(currentUserId, bannedUserId) {
      const currentTime = new Date().toISOString();

      const payload = {
        user_id: currentUserId,
        banned_user_id: bannedUserId,
        created_at: currentTime,
      };

      return this.database('bans').returning('id').insert(payload);
    }

    deleteUserBan(currentUserId, bannedUserId) {
      return this.database('bans')
        .where({
          user_id: currentUserId,
          banned_user_id: bannedUserId,
        })
        .delete();
    }

    async getGroupsWithDisabledBans(userId, groupIds = null) {
      if (!groupIds) {
        return await this.database.getCol(
          `select group_id from groups_without_bans where user_id = :userId`,
          { userId },
        );
      }

      return await this.database.getCol(
        `select group_id from groups_without_bans
          where user_id = :userId and group_id = any(:groupIds)`,
        { userId, groupIds },
      );
    }

    async disableBansInGroup(userId, groupId, doDisable) {
      if (doDisable) {
        return !!(await this.database.getOne(
          `insert into groups_without_bans
            (user_id, group_id) values (:userId, :groupId)
            on conflict do nothing
            returning true`,
          { userId, groupId },
        ));
      }

      return !!(await this.database.getOne(
        `delete from groups_without_bans
          where (user_id, group_id) = (:userId, :groupId)
          returning true`,
        { userId, groupId },
      ));
    }
  };

export default bansTrait;

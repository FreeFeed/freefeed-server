///////////////////////////////////////////////////
// Group blocks
///////////////////////////////////////////////////

const groupBlocksTrait = (superClass) =>
  class extends superClass {
    async blockUserInGroup(userId, groupId) {
      const { rows } = await this.database.raw(
        `insert into group_blocks (blocked_user_id, group_id) values (:userId, :groupId) on conflict do nothing returning 1`,
        { userId, groupId },
      );
      return rows.length > 0;
    }

    async unblockUserInGroup(userId, groupId) {
      const { rows } = await this.database.raw(
        `delete from group_blocks where (blocked_user_id, group_id) = (:userId, :groupId) returning 1`,
        { userId, groupId },
      );
      return rows.length > 0;
    }

    userIdsBlockedInGroup(groupId) {
      return this.database.getCol(
        `select blocked_user_id from group_blocks where group_id = :groupId order by blocked_user_id`,
        { groupId },
      );
    }

    groupIdsBlockedUser(userId, fromGroupIds = null) {
      if (fromGroupIds) {
        return this.database.getCol(
          `select group_id from group_blocks where blocked_user_id = :userId and group_id = any(:fromGroupIds)`,
          { userId, fromGroupIds },
        );
      }

      return this.database.getCol(
        `select group_id from group_blocks where blocked_user_id = :userId order by group_id`,
        { userId },
      );
    }
  };

export default groupBlocksTrait;

///////////////////////////////////////////////////
// Subscription requests
///////////////////////////////////////////////////

const subscrRequestsTrait = (superClass) =>
  class extends superClass {
    /**
     * @param {string} fromUserId
     * @param {string} toUserId
     * @param {string[]} homeFeedIds - home feeds to add user, null is interprets
     * as default home feed
     * @returns {Promise<boolean>} - true if request was successfully created
     */
    async createSubscriptionRequest(fromUserId, toUserId, homeFeedIds = null) {
      const payload = {
        from_user_id: fromUserId,
        to_user_id: toUserId,
        homefeed_ids: homeFeedIds,
      };

      return !!(await this.database('subscription_requests').returning('id').insert(payload));
    }

    deleteSubscriptionRequest(toUserId, fromUserId) {
      return this.database('subscription_requests')
        .where({
          from_user_id: fromUserId,
          to_user_id: toUserId,
        })
        .delete();
    }

    getUserSubscriptionRequestsIds(toUserId) {
      return this.database.getCol(
        `select from_user_id from 
        subscription_requests s
        join users from_users on from_users.uid = from_user_id
        where to_user_id = :toUserId and from_users.gone_status is null
        order by s.created_at desc`,
        { toUserId },
      );
    }

    async isSubscriptionRequestPresent(fromUserId, toUserId) {
      const res = await this.database('subscription_requests')
        .where({
          from_user_id: fromUserId,
          to_user_id: toUserId,
        })
        .count();
      return parseInt(res[0].count) != 0;
    }

    async getUserSubscriptionPendingRequestsIds(fromUserId) {
      const res = await this.database('subscription_requests')
        .select('to_user_id')
        .orderBy('created_at', 'desc')
        .where('from_user_id', fromUserId);
      const attrs = res.map((record) => {
        return record.to_user_id;
      });
      return attrs;
    }

    /**
     * Returns the subscription request data or null if there is no request.
     *
     * @param {string} toUserId
     * @param {string} fromUserId
     * @returns {Object | null}
     */
    getSubscriptionRequest(toUserId, fromUserId) {
      return this.database.getRow(
        `select * from subscription_requests
        where from_user_id = :fromUserId and to_user_id = :toUserId`,
        { fromUserId, toUserId },
      );
    }

    /**
     * Returns map that represents the mutual subscription request status between the
     * userId and one of otherUserIds. Map keys are UUIDs from the otherUserIds
     * and map values are bit masks: bit 0 means userId sent request to this user,
     * bit 1 means this user request to userId.
     *
     * @param {UUID|null} userId
     * @param {UUID[]} otherUserIds
     * @returns {Promise<Map<UUID, 0|1|2|3>>}
     */
    async getMutualSubscriptionRequestStatuses(userId, otherUserIds) {
      const map = new Map(otherUserIds.map((id) => [id, 0]));

      if (!userId || otherUserIds.length === 0) {
        return map;
      }

      const rows = await this.database.getAll(
        `( -- requests from userId
            select to_user_id as id, 1 as status from
            subscription_requests
            where from_user_id = :userId and to_user_id = any(:otherUserIds)
          )
          union all
          ( -- requests to userId
            select from_user_id as id, 2 as status from
            subscription_requests
            where to_user_id = :userId and from_user_id = any(:otherUserIds)
          )
        `,
        { userId, otherUserIds },
      );

      for (const { id, status } of rows) {
        map.set(id, map.get(id) | status);
      }

      return map;
    }
  };

export default subscrRequestsTrait;

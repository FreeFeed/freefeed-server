///////////////////////////////////////////////////
// Subscription requests
///////////////////////////////////////////////////

const subscrRequestsTrait = (superClass) =>
  class extends superClass {
    createSubscriptionRequest(fromUserId, toUserId) {
      const currentTime = new Date().toISOString();

      const payload = {
        from_user_id: fromUserId,
        to_user_id: toUserId,
        created_at: currentTime,
      };

      return this.database('subscription_requests')
        .returning('id')
        .insert(payload);
    }

    deleteSubscriptionRequest(toUserId, fromUserId) {
      return this.database('subscription_requests')
        .where({
          from_user_id: fromUserId,
          to_user_id: toUserId,
        })
        .delete();
    }

    async getUserSubscriptionRequestsIds(toUserId) {
      const res = await this.database('subscription_requests')
        .select('from_user_id')
        .orderBy('created_at', 'desc')
        .where('to_user_id', toUserId);
      const attrs = res.map((record) => {
        return record.from_user_id;
      });
      return attrs;
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
  };

export default subscrRequestsTrait;

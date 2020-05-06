///////////////////////////////////////////////////
// Subscription requests
///////////////////////////////////////////////////

const subscrRequestsTrait = (superClass) => class extends superClass {
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
      to_user_id:   toUserId,
      homefeed_ids: homeFeedIds,
    }

    return !!(await this.database('subscription_requests')
      .returning('id').insert(payload));
  }

  deleteSubscriptionRequest(toUserId, fromUserId) {
    return this.database('subscription_requests').where({
      from_user_id: fromUserId,
      to_user_id:   toUserId
    }).delete()
  }

  async getUserSubscriptionRequestsIds(toUserId) {
    const res = await this.database('subscription_requests').select('from_user_id').orderBy('created_at', 'desc').where('to_user_id', toUserId)
    const attrs = res.map((record) => {
      return record.from_user_id
    })
    return attrs
  }

  async isSubscriptionRequestPresent(fromUserId, toUserId) {
    const res = await this.database('subscription_requests').where({
      from_user_id: fromUserId,
      to_user_id:   toUserId
    }).count()
    return parseInt(res[0].count) != 0
  }

  async getUserSubscriptionPendingRequestsIds(fromUserId) {
    const res = await this.database('subscription_requests').select('to_user_id').orderBy('created_at', 'desc').where('from_user_id', fromUserId)
    const attrs = res.map((record) => {
      return record.to_user_id
    })
    return attrs
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
      { fromUserId, toUserId }
    );
  }
};

export default subscrRequestsTrait;

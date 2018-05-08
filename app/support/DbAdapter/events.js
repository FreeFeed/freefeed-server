import { COUNTABLE_EVENT_TYPES } from '../EventTypes';

///////////////////////////////////////////////////
// Events
///////////////////////////////////////////////////

const eventsTrait = (superClass) => class extends superClass {
  async createEvent(
    recipientIntId, eventType, createdByUserIntId, targetUserIntId = null,
    groupIntId = null, postId = null, commentId = null, postAuthorIntId = null
  ) {
    const postIntId = postId ? await this._getPostIntIdByUUID(postId) : null;
    const commentIntId = commentId ? await this._getCommentIntIdByUUID(commentId) : null;

    const payload = {
      user_id:            recipientIntId,
      event_type:         eventType,
      created_by_user_id: createdByUserIntId,
      target_user_id:     targetUserIntId,
      group_id:           groupIntId,
      post_id:            postIntId,
      comment_id:         commentIntId,
      post_author_id:     postAuthorIntId
    };

    const insertSQL = this.database('events').insert(payload).toString();
    return this.database.raw(`${insertSQL} on conflict do nothing`);
  }

  getUserEvents(userIntId, eventTypes = null, limit = null, offset = null, startDate = null, endDate = null) {
    let query = this.database('events').where('user_id', userIntId)
    if (eventTypes && eventTypes.length > 0) {
      query = query.whereIn('event_type', eventTypes);
    }

    if (startDate) {
      query = query.where('created_at', '>=', startDate.toISOString());
    }

    if (endDate) {
      query = query.where('created_at', '<=', endDate.toISOString());
    }

    if (limit) {
      query = query.limit(limit);
    }

    if (offset) {
      query = query.offset(offset);
    }
    return query.orderBy('created_at', 'desc').orderBy('id', 'desc');
  }

  async _getGroupIntIdByUUID(groupUUID) {
    const res = await this.database('users').returning('id').first().where('uid', groupUUID).andWhere('type', 'group');
    if (!res) {
      return null;
    }
    return res.id;
  }

  async _getPostIntIdByUUID(postUUID) {
    const res = await this.database('posts').returning('id').first().where('uid', postUUID);
    if (!res) {
      return null;
    }
    return res.id;
  }

  ///////////////////////////////////////////////////
  // Unread events counter
  ///////////////////////////////////////////////////

  async markAllEventsAsRead(userId) {
    const currentTime = new Date().toISOString();

    const payload = { notifications_read_at: currentTime };

    await this.database('users').where('uid', userId).update(payload);
    await this.cacheFlushUser(userId);
  }

  async getUnreadEventsNumber(userId) {
    const user = await this.getUserById(userId);
    const notificationsLastReadTime = user.notificationsReadAt ? user.notificationsReadAt : new Date(0);

    const res = await this.database('events')
      .where('user_id', user.intId)
      .whereRaw('("created_by_user_id" IS NULL OR "user_id" <> "created_by_user_id")')
      .whereIn('event_type', COUNTABLE_EVENT_TYPES)
      .where('created_at', '>=', notificationsLastReadTime)
      .count();


    return parseInt(res[0].count, 10) || 0;
  }

  async getDigestSentAt(userIntIds) {
    const res = await this.database('sent_emails_log')
      .select('user_id')
      .max('sent_at as sent_at')
      .whereIn('user_id', userIntIds)
      .andWhere('email_type', 'notification')
      .groupBy('user_id');

    const emailSentMapping = {};
    for (const entry of res) {
      emailSentMapping[entry.user_id] = entry.sent_at;
    }
    return emailSentMapping;
  }

  async getDailyBestOfEmailSentAt(userIntIds) {
    const res = await this.database('sent_emails_log')
      .select('user_id')
      .max('sent_at as sent_at')
      .whereIn('user_id', userIntIds)
      .andWhere('email_type', 'daily_best_of')
      .groupBy('user_id');

    const emailSentMapping = {};
    for (const entry of res) {
      emailSentMapping[entry.user_id] = entry.sent_at;
    }
    return emailSentMapping;
  }

  addSentEmailLogEntry(userIntId, email, emailType) {
    return this.database('sent_emails_log').insert({
      email_type: emailType,
      user_id:    userIntId,
      email
    });
  }
};

export default eventsTrait;

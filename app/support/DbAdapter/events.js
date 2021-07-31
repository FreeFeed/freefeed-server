import { COUNTABLE_EVENT_TYPES } from '../EventTypes';

///////////////////////////////////////////////////
// Events
///////////////////////////////////////////////////

const eventsTrait = (superClass) =>
  class extends superClass {
    async createEvent(
      recipientIntId,
      eventType,
      createdByUserIntId,
      targetUserIntId = null,
      groupIntId = null,
      postId = null,
      commentId = null,
      postAuthorIntId = null,
      targetPostId = null,
      targetCommentId = null,
    ) {
      const postIntId = postId ? await this._getPostIntIdByUUID(postId) : null;
      const commentIntId = commentId ? await this._getCommentIntIdByUUID(commentId) : null;

      const payload = {
        user_id: recipientIntId,
        event_type: eventType,
        created_by_user_id: createdByUserIntId,
        target_user_id: targetUserIntId,
        group_id: groupIntId,
        post_id: postIntId,
        comment_id: commentIntId,
        post_author_id: postAuthorIntId,
        target_post_id: targetPostId,
        target_comment_id: targetCommentId,
      };

      const insertSQL = this.database('events').insert(payload).toString();
      return await this.database.getRow(`${insertSQL} on conflict do nothing returning *`);
    }

    getEventById(eventId) {
      return this.database.getRow(`select * from events where uid = :eventId`, { eventId });
    }

    getUserEvents(
      userIntId,
      eventTypes = null,
      limit = null,
      offset = null,
      startDate = null,
      endDate = null,
    ) {
      let query = this.database('events').where('user_id', userIntId);

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
      const res = await this.database('users')
        .returning('id')
        .first()
        .where('uid', groupUUID)
        .andWhere('type', 'group');

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
      await this.database.raw(
        `update users set notifications_read_at = now() where uid = :userId`,
        { userId },
      );
      await this.cacheFlushUser(userId);
    }

    async getUnreadEventsNumber(userId) {
      const {
        rows: [userData],
      } = await this.database.raw(
        `select notifications_read_at, id from users where uid = :userId`,
        { userId },
      );

      if (!userData) {
        throw new Error(`User ${userId} is not found`);
      }

      const {
        rows: [{ count }],
      } = await this.database.raw(
        `select count(*)::int from events where
          user_id = :userIntId
          and (created_by_user_id is null or user_id <> created_by_user_id)
          and event_type = any(:eventTypes)
          and created_at >= :notificationsReadAt`,
        {
          userIntId: userData.id,
          notificationsReadAt: userData.notifications_read_at,
          eventTypes: COUNTABLE_EVENT_TYPES,
        },
      );

      return count;
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

    async getWeeklyBestOfEmailSentAt(userIntIds) {
      const res = await this.database('sent_emails_log')
        .select('user_id')
        .max('sent_at as sent_at')
        .whereIn('user_id', userIntIds)
        .andWhere('email_type', 'weekly_best_of')
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
        user_id: userIntId,
        email,
      });
    }
  };

export default eventsTrait;

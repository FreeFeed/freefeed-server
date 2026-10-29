import * as _ from 'lodash-es';
import GraphemeBreaker from 'grapheme-breaker';
import config from 'config';

import monitor from '../support/monitor';
import { extractHashtags } from '../support/hashtags';
import { PubSub as pubSub } from '../models';
import { EventService } from '../support/EventService';
import { getRoomsOfPost } from '../pubsub-listener';
import {
  getUpdatedShortIds,
  getUpdatedUUIDs,
  notifyBacklinkedLater,
  notifyBacklinkedNow,
} from '../support/backlinks';
import { List } from '../support/open-lists';
import { scheduleCommentDeletion } from '../jobs/delete-comment';

export function addModel(dbAdapter) {
  class Comment {
    static VISIBLE = 0;
    static DELETED = 1;
    // The author of the comment was banned by a viewer
    static HIDDEN_AUTHOR_BANNED = 2;
    static HIDDEN_ARCHIVED = 3;
    // A viewer was banned by the author of the comment
    static HIDDEN_VIEWER_BANNED = 4;

    id;
    intId;
    shortId;
    body_;
    userId;
    postId;
    hideType;
    createdAt;
    updatedAt;
    seqNumber;
    toDelete;

    static hiddenBody(hideType) {
      switch (hideType) {
        case this.VISIBLE:
          return 'Visible comment';
        case this.DELETED:
          return 'Deleted comment';
        case this.HIDDEN_AUTHOR_BANNED:
          return 'Comment from a blocked user';
        case this.HIDDEN_ARCHIVED:
          return 'Archived comment';
        case this.HIDDEN_VIEWER_BANNED:
          return 'Comment from a user who blocked you';
        default:
          return 'Hidden comment';
      }
    }

    constructor(params) {
      this.id = params.id;
      this.intId = params.intId;
      this.shortId = params.shortId;
      this.body = params.body;
      this.userId = params.userId;
      this.postId = params.postId;
      this.hideType = params.hideType || Comment.VISIBLE;
      this.seqNumber = params.seqNumber;
      this.toDelete = params.toDelete || false;

      if (parseInt(params.createdAt, 10)) {
        this.createdAt = params.createdAt;
      }

      if (parseInt(params.updatedAt, 10)) {
        this.updatedAt = params.updatedAt;
      }
    }

    get body() {
      return this.body_;
    }

    set body(newValue) {
      if (!newValue) {
        this.body_ = '';
        return;
      }

      this.body_ = newValue.trim();
    }

    validate() {
      const valid =
        this.body &&
        this.body.length > 0 &&
        this.userId &&
        this.userId.length > 0 &&
        this.postId &&
        this.postId.length > 0;

      if (!valid) {
        throw new Error('Comment text must not be empty');
      }

      const len = GraphemeBreaker.countBreaks(this.body);

      if (len > config.maxLength.comment) {
        throw new Error(`Maximum comment length is ${config.maxLength.comment} characters`);
      }
    }

    async create() {
      this.validate();

      const payload = {
        body: this.body,
        userId: this.userId,
        postId: this.postId,
        hideType: this.hideType,
      };

      this.id = await dbAdapter.createComment(payload);
      const newComment = await dbAdapter.getCommentById(this.id);
      const fieldsToUpdate = ['intId', 'shortId', 'createdAt', 'updatedAt', 'seqNumber'];

      for (const f of fieldsToUpdate) {
        this[f] = newComment[f];
      }

      const post = await dbAdapter.getPostById(this.postId);

      const [authorCommentsFeed, postDestFeeds] = await Promise.all([
        dbAdapter.getUserNamedFeed(this.userId, 'Comments'),
        post.getPostedTo(),
      ]);

      await dbAdapter.insertPostIntoFeeds([authorCommentsFeed.intId], post.id);

      const rtUpdates = postDestFeeds
        .filter((f) => f.isDirects())
        .map((f) => pubSub.updateUnreadDirects(f.userId));

      const uuids = await dbAdapter.getPostLongIds(getUpdatedShortIds(this.body));
      uuids.push(...getUpdatedUUIDs(this.body));

      await Promise.all([
        ...rtUpdates,
        dbAdapter.setPostBumpedAt(post.id),
        dbAdapter.setUpdatedAtInGroupsByIds(postDestFeeds.map((f) => f.userId)),
        this.processHashtagsOnCreate(),
        pubSub.newComment(this),
        EventService.onCommentChanged(this, true),
        notifyBacklinkedNow(this, pubSub, uuids),
      ]);

      await pubSub.updateGroupTimes(postDestFeeds.map((f) => f.userId));

      monitor.increment('users.comments');
    }

    async update(params) {
      const uuids = await dbAdapter.getPostLongIds(getUpdatedShortIds(this.body, params.body));
      uuids.push(...getUpdatedUUIDs(this.body, params.body));

      const notifyBacklinked = await notifyBacklinkedLater(this, pubSub, uuids);

      const prevBody = this.body;
      this.updatedAt = new Date().getTime();
      this.body = params.body;

      this.validate();

      const payload = {
        body: this.body,
        updatedAt: this.updatedAt.toString(),
      };
      await dbAdapter.updateComment(this.id, payload);

      await Promise.all([
        this.processHashtagsOnUpdate(),
        pubSub.updateComment(this.id),
        EventService.onCommentChanged(this, false, { prevBody }),
        notifyBacklinked(),
      ]);

      return this;
    }

    getPost() {
      return dbAdapter.getPostById(this.postId);
    }

    setHideType(hideType) {
      this.hideType = hideType;

      if (this.hideType === Comment.VISIBLE) {
        return;
      }

      this.body = Comment.hiddenBody(this.hideType);
      this.userId = null;
    }

    /**
     * Users can view post body
     */
    async usersCanSee() {
      if (this.hideType !== Comment.VISIBLE) {
        return List.empty();
      }

      return await dbAdapter.getUsersWhoCanSeeComment({
        postId: this.postId,
        authorId: this.userId,
      });
    }

    /**
     * Inactivate comment: mark it to be deleted, but don't actually delete it.
     *
     * @param {User} [deletedBy]
     * @return {Promise<boolean>}
     */
    async inactivate(deletedBy = null) {
      if (this.toDelete) {
        return false;
      }

      const uuids = await dbAdapter.getPostLongIds(getUpdatedShortIds(this.body));
      uuids.push(...getUpdatedUUIDs(this.body));

      const post = await this.getPost();
      const realtimeRooms = await getRoomsOfPost(post);
      const notifyBacklinked = await notifyBacklinkedLater(this, pubSub, uuids);

      await dbAdapter.updateComment(this.id, { toDelete: true });
      this.toDelete = true;

      if (this.userId) {
        await dbAdapter.withdrawPostFromCommentsFeedIfNoMoreComments(this.postId, this.userId);
      }

      await Promise.all([
        pubSub.destroyComment(this.id, this.postId, realtimeRooms),
        deletedBy ? EventService.onCommentDestroyed(this, deletedBy) : null,
        notifyBacklinked(),
        // Schedule comment deletion
        scheduleCommentDeletion(this.id),
      ]);

      return true;
    }

    /**
     * Restore inactivated comment
     *
     * @param {User} [restoredBy]
     * @returns {Promise<boolean>}
     */
    async activate(restoredBy = null) {
      if (!this.toDelete) {
        return false;
      }

      await dbAdapter.updateComment(this.id, { toDelete: false });
      this.toDelete = false;

      // The comment restoration looks like a new comment creation for client
      // (in some ways), so we need to send some notifications

      const post = await dbAdapter.getPostById(this.postId);
      const authorCommentsFeed = await dbAdapter.getUserNamedFeed(this.userId, 'Comments');

      await dbAdapter.insertPostIntoFeeds([authorCommentsFeed.intId], post.id);

      const uuids = await dbAdapter.getPostLongIds(getUpdatedShortIds(this.body));
      uuids.push(...getUpdatedUUIDs(this.body));

      await Promise.all([
        pubSub.restoreComment(this.id),
        EventService.onCommentRestored(this, restoredBy),
        notifyBacklinkedNow(this, pubSub, uuids),
      ]);

      return true;
    }

    canBeDestroyed() {
      return !this.toDelete && this.hideType !== Comment.DELETED;
    }

    async destroy() {
      return await dbAdapter.deleteComment(this.id, this.postId);
    }

    getCreatedBy() {
      return dbAdapter.getUserById(this.userId);
    }

    async processHashtagsOnCreate() {
      const commentTags = _.uniq(extractHashtags(this.body.toLowerCase()));

      if (!commentTags || commentTags.length == 0) {
        return;
      }

      await dbAdapter.linkCommentHashtagsByNames(commentTags, this.id);
    }

    async processHashtagsOnUpdate() {
      const linkedCommentHashtags = await dbAdapter.getCommentHashtags(this.id);

      const presentTags = _.sortBy(linkedCommentHashtags.map((t) => t.name));
      const newTags = _.sortBy(_.uniq(extractHashtags(this.body.toLowerCase())));

      if (presentTags == newTags) {
        return;
      }

      const notChangedTags = _.intersection(presentTags, newTags);
      const tagsToUnlink = _.difference(presentTags, notChangedTags);
      const tagsToLink = _.difference(newTags, notChangedTags);

      if (tagsToUnlink.length > 0) {
        await dbAdapter.unlinkCommentHashtagsByNames(tagsToUnlink, this.id);
      }

      if (tagsToLink.length > 0) {
        await dbAdapter.linkCommentHashtagsByNames(tagsToLink, this.id);
      }
    }

    /**
     * Adds like to comment. This method does not performs any access check.
     * It returns true on success and false if this comment was already
     * liked by this user.
     *
     * @param {User} user
     * @param {Object} options
     * @param {string} options.operationId - Operation ID for client-side deduplication
     * @returns {Promise<boolean>}
     */
    async addLike(user, { operationId = null } = {}) {
      const ok = await dbAdapter.createCommentLike(this.id, user.id);

      if (ok) {
        await pubSub.newCommentLike(this.id, this.postId, user.id, { operationId });
      }

      return ok;
    }

    /**
     * Removes like from comment. This method does not performs any access check.
     * It returns true on success and false if this comment was not already
     * liked by this user.
     *
     * @param {User} user
     * @param {Object} options
     * @param {string} options.operationId - Operation ID for client-side deduplication
     * @returns {boolean}
     */
    async removeLike(user, { operationId = null } = {}) {
      const ok = await dbAdapter.deleteCommentLike(this.id, user.id);

      if (ok) {
        await pubSub.removeCommentLike(this.id, this.postId, user.id, { operationId });
      }

      return ok;
    }
  }

  return Comment;
}

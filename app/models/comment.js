/* eslint babel/semi: "error" */
import _ from 'lodash';
import GraphemeBreaker from 'grapheme-breaker';
import monitor from 'monitor-dog';

import { extractHashtags } from '../support/hashtags';
import { PubSub as pubSub } from '../models';
import { EventService } from '../support/EventService';
import { getRoomsOfPost } from '../pubsub-listener';


export function addModel(dbAdapter) {
  class Comment {
    static VISIBLE         = 0;
    static DELETED         = 1;
    static HIDDEN_BANNED   = 2;
    static HIDDEN_ARCHIVED = 3;

    id;
    body_;
    userId;
    postId;
    hideType;
    createdAt;
    updatedAt;

    static hiddenBody(hideType) {
      switch (hideType) {
        case this.VISIBLE:         return 'Visible comment';
        case this.DELETED:         return 'Deleted comment';
        case this.HIDDEN_BANNED:   return 'Hidden comment';
        case this.HIDDEN_ARCHIVED: return 'Archived comment';
        default:                   return 'Hidden comment';
      }
    }

    constructor(params) {
      this.id = params.id;
      this.body = params.body;
      this.userId = params.userId;
      this.postId = params.postId;
      this.hideType = params.hideType || Comment.VISIBLE;

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
      const valid = this.body
        && this.body.length > 0
        && this.userId
        && this.userId.length > 0
        && this.postId
        && this.postId.length > 0;

      if (!valid) {
        throw new Error('Comment text must not be empty');
      }

      const len = GraphemeBreaker.countBreaks(this.body);

      if (len > 1500) {
        throw new Error('Maximum comment length is 1500 characters');
      }
    }

    async create() {
      await this.validate();

      const payload = {
        'body':     this.body,
        'userId':   this.userId,
        'postId':   this.postId,
        'hideType': this.hideType,
      };

      this.id = await dbAdapter.createComment(payload);
      const newComment = await dbAdapter.getCommentById(this.id);
      const fieldsToUpdate = [
        'createdAt',
        'updatedAt',
      ];

      for (const f of fieldsToUpdate) {
        this[f] = newComment[f];
      }

      const post = await dbAdapter.getPostById(this.postId);

      const [
        authorCommentsFeed,
        postDestFeeds,
      ] = await Promise.all([
        dbAdapter.getUserNamedFeed(this.userId, 'Comments'),
        post.getPostedTo(),
      ]);

      await dbAdapter.insertPostIntoFeeds([authorCommentsFeed.intId], post.id);

      const rtUpdates = postDestFeeds
        .filter((f) => f.isDirects())
        .map((f) => pubSub.updateUnreadDirects(f.userId));

      await Promise.all([
        ...rtUpdates,
        dbAdapter.setPostBumpedAt(post.id),
        dbAdapter.setUpdatedAtInGroupsByIds(postDestFeeds.map((f) => f.userId)),
        this.processHashtagsOnCreate(),
        dbAdapter.statsCommentCreated(this.userId),
        pubSub.newComment(this),
        EventService.onCommentChanged(this, true),
      ]);

      await pubSub.updateGroupTimes(postDestFeeds.map((f) => f.userId));

      monitor.increment('users.comments');
    }

    async update(params) {
      this.updatedAt = new Date().getTime();
      this.body = params.body;

      await this.validate();

      const payload = {
        'body':      this.body,
        'updatedAt': this.updatedAt.toString()
      };
      await dbAdapter.updateComment(this.id, payload);

      await Promise.all([
        this.processHashtagsOnUpdate(),
        pubSub.updateComment(this.id),
        EventService.onCommentChanged(this),
      ]);

      return this;
    }

    getPost() {
      return dbAdapter.getPostById(this.postId);
    }

    canBeDestroyed() {
      return this.hideType !== Comment.DELETED;
    }

    async destroy(destroyedBy = null) {
      const post = await this.getPost();
      const realtimeRooms = await getRoomsOfPost(post);
      await dbAdapter.deleteComment(this.id, this.postId);

      if (this.userId) {
        await dbAdapter.withdrawPostFromCommentsFeedIfNoMoreComments(this.postId, this.userId);
      }

      await Promise.all([
        pubSub.destroyComment(this.id, this.postId, realtimeRooms),
        this.userId ? dbAdapter.statsCommentDeleted(this.userId) : null,
        destroyedBy ? EventService.onCommentDestroyed(this, destroyedBy) : null,
      ]);
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

      const presentTags    = _.sortBy(linkedCommentHashtags.map((t) => t.name));
      const newTags        = _.sortBy(_.uniq(extractHashtags(this.body.toLowerCase())));

      if (presentTags == newTags) {
        return;
      }

      const notChangedTags = _.intersection(presentTags, newTags);
      const tagsToUnlink   = _.difference(presentTags, notChangedTags);
      const tagsToLink     = _.difference(newTags, notChangedTags);

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
     * @returns {Promise<boolean>}
     */
    async addLike(user) {
      const ok = await dbAdapter.createCommentLike(this.id, user.id);

      if (ok) {
        await pubSub.newCommentLike(this.id, this.postId, user.id);
      }

      return ok;
    }

    /**
     * Removes like from comment. This method does not performs any access check.
     * It returns true on success and false if this comment was not already
     * liked by this user.
     *
     * @param {User} user
     * @returns {boolean}
     */
    async removeLike(user) {
      const ok = await dbAdapter.deleteCommentLike(this.id, user.id);

      if (ok) {
        await pubSub.removeCommentLike(this.id, this.postId, user.id);
      }

      return ok;
    }
  }

  return Comment;
}

/* eslint babel/semi: "error" */
import _ from 'lodash';
import GraphemeBreaker from 'grapheme-breaker';

import { extractHashtags } from '../support/hashtags';
import { PubSub as pubSub } from '../models';


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
        default:                      return 'Hidden comment';
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
      this.createdAt = new Date().getTime();
      this.updatedAt = new Date().getTime();

      await this.validate();

      const payload = {
        'body':      this.body,
        'userId':    this.userId,
        'postId':    this.postId,
        'createdAt': this.createdAt.toString(),
        'updatedAt': this.updatedAt.toString(),
        'hideType':  this.hideType,
      };

      this.id = await dbAdapter.createComment(payload);

      const post = await dbAdapter.getPostById(this.postId);
      const timelines = await post.addComment(this);

      await this.processHashtagsOnCreate();

      await dbAdapter.statsCommentCreated(this.userId);

      return timelines;
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

      await this.processHashtagsOnUpdate();

      await pubSub.updateComment(this.id);

      return this;
    }

    getPost() {
      return dbAdapter.getPostById(this.postId);
    }

    canBeDestroyed() {
      return this.hideType !== Comment.DELETED;
    }

    async destroy() {
      await dbAdapter.deleteComment(this.id, this.postId);
      await pubSub.destroyComment(this.id, this.postId);
      if (!this.userId) {
        // there was hidden comment
        return;
      }
      await dbAdapter.statsCommentDeleted(this.userId);

      // Look for other comments from this user in the post:
      // if this was the last one then remove the post from "user's comments" timeline
      const post = await dbAdapter.getPostById(this.postId);
      const comments = await post.getComments();

      if (!_.some(comments, ['userId', this.userId])) {
        const user = await dbAdapter.getUserById(this.userId);
        const timelineId = await user.getCommentsTimelineIntId();

        await dbAdapter.withdrawPostFromFeeds([timelineId], this.postId);
      }
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
  }

  return Comment;
}

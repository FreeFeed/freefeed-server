/* eslint babel/semi: "error" */
import GraphemeBreaker from 'grapheme-breaker';
import _ from 'lodash';

import { extractHashtags } from '../support/hashtags';
import { Timeline, PubSub as pubSub } from '../models';
import { getRoomsOfPost } from '../pubsub-listener';


export function addModel(dbAdapter) {
  class Post {
    id;
    attachments;
    userId;
    timelineIds;
    currentUser;
    commentsDisabled;
    feedIntIds;
    destinationFeedIds;
    commentsCount;
    likesCount;
    isPrivate;
    isProtected;
    isPropagable;

    constructor(params) {
      this.id               = params.id;
      this.body             = params.body;
      this.attachments      = params.attachments;
      this.userId           = params.userId;
      this.timelineIds      = params.timelineIds;
      this.currentUser      = params.currentUser;
      this.commentsDisabled = params.commentsDisabled;
      this.feedIntIds       = params.feedIntIds || [];
      this.destinationFeedIds = params.destinationFeedIds || [];
      this.commentsCount    = params.commentsCount;
      this.likesCount       = params.likesCount;
      this.isPrivate        = params.isPrivate || '0';
      this.isProtected      = params.isProtected || '0';
      this.isPropagable     = params.isPropagable || '0';

      if (params.friendfeedUrl) {
        this.friendfeedUrl = params.friendfeedUrl;
      }

      if (parseInt(params.createdAt, 10)) {
        this.createdAt = params.createdAt;
      }

      if (parseInt(params.updatedAt, 10)) {
        this.updatedAt = params.updatedAt;
      }

      if (parseInt(params.bumpedAt, 10)) {
        this.bumpedAt = params.bumpedAt;
      }

      if (params.maxComments != 'all') {
        this.maxComments = parseInt(params.maxComments, 10) || 2;
      } else {
        this.maxComments = params.maxComments;
      }

      if (params.maxLikes !== 'all') {
        this.maxLikes = parseInt(params.maxLikes, 10) || 3;
      } else {
        this.maxLikes = params.maxLikes;
      }
    }

    get body() {
      return this.body_;
    }

    set body(newValue) {
      if (!newValue) {
        this.body_ = '';
      }

      this.body_ = newValue.trim();
    }

    validate() {
      const valid = this.body
                 && this.body.length > 0
                 && this.userId
                 && this.userId.length > 0;

      if (!valid) {
        throw new Error('Post text must not be empty');
      }

      const len = GraphemeBreaker.countBreaks(this.body);

      if (len > 1500) {
        throw new Error('Maximum post-length is 1500 graphemes');
      }
    }

    async create() {
      this.createdAt = new Date().getTime();
      this.updatedAt = new Date().getTime();
      this.bumpedAt = new Date().getTime();

      await this.validate();

      const payload = {
        'body':             this.body,
        'userId':           this.userId,
        'createdAt':        this.createdAt.toString(),
        'updatedAt':        this.updatedAt.toString(),
        'bumpedAt':         this.updatedAt.toString(),
        'commentsDisabled': this.commentsDisabled
      };
      this.feedIntIds = await dbAdapter.getTimelinesIntIdsByUUIDs(this.timelineIds);
      this.destinationFeedIds = this.feedIntIds.slice();
      // save post to the database
      this.id = await dbAdapter.createPost(payload, this.feedIntIds);

      const newPost = await dbAdapter.getPostById(this.id);
      this.isPrivate = newPost.isPrivate;
      this.isProtected = newPost.isProtected;
      this.isPropagable = newPost.isPropagable;

      // save nested resources
      await this.linkAttachments();
      await this.processHashtagsOnCreate();

      await Timeline.publishPost(this);

      await dbAdapter.statsPostCreated(this.userId);

      return this;
    }

    async update(params) {
      // Reflect post changes and validate
      this.updatedAt = new Date().getTime();
      this.body = params.body;
      await this.validate();

      // Calculate changes in attachments
      const oldAttachments = await this.getAttachmentIds() || [];
      const newAttachments = params.attachments || [];
      const removedAttachments = oldAttachments.filter((i) => !newAttachments.includes(i));

      // Update post body in DB
      const payload = {
        'body':      this.body,
        'updatedAt': this.updatedAt.toString()
      };
      await dbAdapter.updatePost(this.id, payload);

      // Update post attachments in DB
      await Promise.all([
        this.linkAttachments(newAttachments),
        this.unlinkAttachments(removedAttachments)
      ]);

      await this.processHashtagsOnUpdate();

      // Finally, publish changes
      await pubSub.updatePost(this.id);

      return this;
    }

    async setCommentsDisabled(newValue) {
      // Reflect post changes
      this.commentsDisabled = newValue;

      // Update post body in DB
      const payload = { 'commentsDisabled': this.commentsDisabled };
      await dbAdapter.updatePost(this.id, payload);

      // Finally, publish changes
      await pubSub.updatePost(this.id);

      return this;
    }

    async destroy() {
      const [
        realtimeRooms,
        comments,
      ] = await Promise.all([
        getRoomsOfPost(this),
        this.getComments(),
        dbAdapter.statsPostDeleted(this.userId, this.id),  // needs data in DB
      ]);

      // remove all comments
      await Promise.all(comments.map((comment) => comment.destroy()));

      await dbAdapter.withdrawPostFromFeeds(this.feedIntIds, this.id);
      await dbAdapter.deletePost(this.id);

      await pubSub.destroyPost(this.id, realtimeRooms);
    }

    getCreatedBy() {
      return dbAdapter.getUserById(this.userId);
    }

    async getSubscribedTimelineIds(groupOnly) {
      if (typeof groupOnly === 'undefined') {
        groupOnly = false;
      }

      const feed = await dbAdapter.getFeedOwnerById(this.userId);

      const feeds = [feed.getRiverOfNewsTimelineId()];
      if (!groupOnly) {
        feeds.push(feed.getPostsTimelineId());
      }

      let timelineIds = await Promise.all(feeds);
      const newTimelineIds = await this.getTimelineIds();

      timelineIds = timelineIds.concat(newTimelineIds);
      return _.uniq(timelineIds);
    }

    async getSubscribedTimelines() {
      const timelineIds = await this.getSubscribedTimelineIds();
      this.subscribedTimelines = await dbAdapter.getTimelinesByIds(timelineIds);

      return this.subscribedTimelines;
    }

    async getTimelineIds() {
      const timelineIds = await dbAdapter.getPostUsagesInTimelines(this.id);
      this.timelineIds = timelineIds || [];
      return this.timelineIds;
    }

    async getTimelines() {
      this.timelines = await dbAdapter.getTimelinesByIntIds(this.feedIntIds);

      return this.timelines;
    }

    async getPostedToIds() {
      const timelineIds = await dbAdapter.getTimelinesUUIDsByIntIds(this.destinationFeedIds);
      this.timelineIds = timelineIds || [];
      return this.timelineIds;
    }

    async getPostedTo() {
      this.postedTo = await dbAdapter.getTimelinesByIntIds(this.destinationFeedIds);

      return this.postedTo;
    }

    /**
     * Returns all RiverOfNews timelines this post belongs to.
     * Timelines are calculated dynamically.
     *
     * @return {Timeline[]}
     */
    async getRiverOfNewsTimelines() {
      const postFeeds = await this.getTimelines();
      const activities = postFeeds.filter((f) => f.isLikes() || f.isComments());
      const destinations = postFeeds.filter((f) => f.isPosts() || f.isDirects());

      /**
       * 'RiverOfNews' feeds of:
       * - post author
       * - users subscribed to post destinations feeds ('Posts')
       * - owners of post destinations feeds ('Posts' and 'Directs')
       * - (if post is propagable) users subscribed to post activity feeds ('Likes' and 'Comments').
       */
      const riverOfNewsSourceIds = [...destinations, ...(this.isPropagable === '1' ? activities : [])].map((f) => f.id);
      const riverOfNewsOwnerIds = await dbAdapter.getUsersSubscribedToTimelines(riverOfNewsSourceIds);
      const destinationOwnerIds = destinations.map((f) => f.userId);
      return await dbAdapter.getUsersNamedTimelines(
        _.uniq([
          ...riverOfNewsOwnerIds,
          ...destinationOwnerIds,
          this.userId,
        ]),
        'RiverOfNews',
      );
    }

    /**
     * Returns all MyDiscussions timelines this post belongs to.
     * Timelines are calculated dynamically.
     *
     * @return {Timeline[]}
     */
    async getMyDiscussionsTimelines() {
      const postFeeds = await this.getTimelines();
      const activities = postFeeds.filter((f) => f.isLikes() || f.isComments());

      /**
       * 'MyDiscussions' feeds of post author and users who did
       * some activity (likes, comments) on post.
       */
      const myDiscussionsOwnerIds = activities.map((f) => f.userId);
      myDiscussionsOwnerIds.push(this.userId);
      return await dbAdapter.getUsersNamedTimelines(_.uniq(myDiscussionsOwnerIds), 'MyDiscussions');
    }

    async getGenericFriendOfFriendTimelineIntIds(user, type) {
      const timelineIntIds = [];

      const userTimelineIntId = await user[`get${type}TimelineIntId`]();
      timelineIntIds.push(userTimelineIntId);

      const timelines = await dbAdapter.getTimelinesByIntIds(this.destinationFeedIds);
      const timelineOwners = await dbAdapter.getFeedOwnersByIds(timelines.map((tl) => tl.userId));

      // Adds the specified post to River of News if and only if
      // that post has been published to user's Post timeline,
      // otherwise this post will stay in group(s) timelines
      let groupOnly = true;

      if (_.some(timelineOwners.map((owner) => owner.isUser()))) {
        groupOnly = false;

        const timeline = await dbAdapter.getTimelineByIntId(userTimelineIntId);
        const subscribersIds = await timeline.getSubscriberIds();
        const subscribersRiversOfNewsIntIds = await dbAdapter.getUsersNamedFeedsIntIds(subscribersIds, ['RiverOfNews']);
        timelineIntIds.push(subscribersRiversOfNewsIntIds);
      }

      const postAuthor = await dbAdapter.getFeedOwnerById(this.userId);
      timelineIntIds.push(await postAuthor.getRiverOfNewsTimelineIntId());

      if (!groupOnly) {
        timelineIntIds.push(await postAuthor.getPostsTimelineIntId());
      }

      timelineIntIds.push(await user.getRiverOfNewsTimelineIntId());
      timelineIntIds.push(this.feedIntIds);

      return _.uniq(_.flatten(timelineIntIds));
    }

    getLikesFriendOfFriendTimelineIntIds(user) {
      return this.getGenericFriendOfFriendTimelineIntIds(user, 'Likes');
    }

    getCommentsFriendOfFriendTimelineIntIds(user) {
      return this.getGenericFriendOfFriendTimelineIntIds(user, 'Comments');
    }

    async hide(userId) {
      const theUser = await dbAdapter.getUserById(userId);
      const hidesTimelineId = await theUser.getHidesTimelineIntId();

      await dbAdapter.insertPostIntoFeeds([hidesTimelineId], this.id);

      await pubSub.hidePost(theUser.id, this.id);
    }

    async unhide(userId) {
      const theUser = await dbAdapter.getUserById(userId);
      const hidesTimelineId = await theUser.getHidesTimelineIntId();

      await dbAdapter.withdrawPostFromFeeds([hidesTimelineId], this.id);

      await pubSub.unhidePost(theUser.id, this.id);
    }

    async addComment(comment) {
      const user = await dbAdapter.getUserById(comment.userId);

      let timelineIntIds = this.destinationFeedIds.slice();

      // only subscribers are allowed to read direct posts
      if (!await this.isStrictlyDirect()) {
        const moreTimelineIntIds = await this.getCommentsFriendOfFriendTimelineIntIds(user);
        timelineIntIds.push(...moreTimelineIntIds);

        timelineIntIds = _.uniq(timelineIntIds);
      }

      let timelines = await dbAdapter.getTimelinesByIntIds(timelineIntIds);

      // no need to post updates to rivers of banned users
      const bannedIds = await user.getBanIds();
      timelines = timelines.filter((timeline) => !(timeline.userId in bannedIds));

      await this.publishChangesToFeeds(timelines, false);

      return timelines;
    }

    async publishChangesToFeeds(timelines, isLikeAction = false) {
      const feedsIntIds = timelines.map((t) => t.intId);
      const insertIntoFeedIds = _.difference(feedsIntIds, this.feedIntIds);
      const timelineOwnersIds = timelines.map((t) => t.userId);

      if (insertIntoFeedIds.length > 0) {
        await dbAdapter.insertPostIntoFeeds(insertIntoFeedIds, this.id);
      }

      if (isLikeAction) {
        return;
      }

      const now = new Date();

      const promises = [
        dbAdapter.setPostBumpedAt(this.id, now.getTime()),
        dbAdapter.setUpdatedAtInGroupsByIds(timelineOwnersIds, now.getTime())
      ];

      await Promise.all(promises);
    }

    async getOmittedComments() {
      let length = this.commentsCount;
      if (length == null) {
        length = await dbAdapter.getPostCommentsCount(this.id);
      }

      if (length > this.maxComments && length > 3 && this.maxComments != 'all') {
        this.omittedComments = length - this.maxComments;
        return this.omittedComments;
      }

      return 0;
    }

    async getPostComments() {
      const comments = await dbAdapter.getAllPostCommentsWithoutBannedUsers(this.id, this.currentUser);
      const commentsIds = comments.map((cmt) => {
        return cmt.id;
      });

      const { length } = comments;
      let visibleCommentsIds = commentsIds;
      let visibleComments = comments;
      if (length > this.maxComments && length > 3 && this.maxComments != 'all') {
        const firstNCommentIds = commentsIds.slice(0, this.maxComments - 1);
        const firstNComments   = comments.slice(0, this.maxComments - 1);
        const lastCommentId = _.last(commentsIds);
        const lastComment   = _.last(comments);

        this.omittedComments = length - this.maxComments;
        visibleCommentsIds = firstNCommentIds.concat(lastCommentId);
        visibleComments = firstNComments.concat(lastComment);
      }

      this.commentIds = visibleCommentsIds;
      return visibleComments;
    }

    async getComments() {
      this.comments = await this.getPostComments();

      return this.comments;
    }

    async linkAttachments(attachmentList) {
      const attachmentIds = attachmentList || this.attachments || [];
      const attachments = await dbAdapter.getAttachmentsByIds(attachmentIds);

      const attachmentPromises = attachments.filter((attachment) => {
        // Filter out invalid attachments
        return attachment.fileSize !== undefined;
      }).map((attachment, ord) => {
        if (this.attachments) {
          const pos = this.attachments.indexOf(attachment.id);

          if (pos === -1) {
            this.attachments.push(attachment);
          } else {
            this.attachments[pos] = attachment;
          }
        }

        // Update connections in DB

        return dbAdapter.linkAttachmentToPost(attachment.id, this.id, ord);
      });

      await Promise.all(attachmentPromises);
    }

    async unlinkAttachments(attachmentList) {
      const attachmentIds = attachmentList || [];
      const attachments = await dbAdapter.getAttachmentsByIds(attachmentIds);

      const attachmentPromises = attachments.map((attachment) => {
        // should we modify `this.attachments` here?

        // Update connections in DB
        return dbAdapter.unlinkAttachmentFromPost(attachment.id, this.id);
      });

      await Promise.all(attachmentPromises);
    }

    async getAttachmentIds() {
      this.attachmentIds = await dbAdapter.getPostAttachments(this.id);
      return this.attachmentIds;
    }

    async getAttachments() {
      this.attachments = await dbAdapter.getAttachmentsOfPost(this.id);

      return this.attachments;
    }

    async getLikeIds() {
      const omittedLikesCount = await this.getOmittedLikes();
      let likedUsersIds = await dbAdapter.getPostLikersIdsWithoutBannedUsers(this.id, this.currentUser);

      likedUsersIds = likedUsersIds.sort((a, b) => {
        if (a == this.currentUser) {
          return -1;
        }

        if (b == this.currentUser) {
          return 1;
        }

        return 0;
      });
      likedUsersIds.splice(likedUsersIds.length - omittedLikesCount, omittedLikesCount);
      return likedUsersIds;
    }

    async getOmittedLikes() {
      let length = this.likesCount;
      if (length == null) {
        length = await dbAdapter.getPostLikesCount(this.id);
      }

      if (this.maxLikes !== 'all') {
        const threshold = this.maxLikes + 1;

        if (length > threshold) {
          return length - this.maxLikes;
        }
      }

      return 0;
    }

    async getLikes() {
      const userIds = await this.getLikeIds();

      const users = await dbAdapter.getUsersByIds(userIds);

      // filter non-existant likers
      this.likes = users.filter(Boolean);

      return this.likes;
    }

    async isStrictlyDirect() {
      const timelines = await this.getPostedTo();
      const flags = timelines.map((timeline) => timeline.isDirects());

      // one non-direct timeline is enough
      return _.every(flags);
    }

    /**
     * Adds like to post. This method does not performs any access check.
     * It returns true on success and false if this post was already
     * liked by this user.
     *
     * @param {User} user
     * @returns {boolean}
     */
    async addLike(user) {
      const success = await dbAdapter.likePost(this.id, user.id);
      if (!success) {
        return false;
      }

      const [
        likesTimeline,
        ,
      ] = await Promise.all([
        user.getLikesTimeline(),
        dbAdapter.statsLikeCreated(user.id),
      ]);

      if (this.isPropagable === '1') {
        // Local bumps
        const prevRONs = await this.getRiverOfNewsTimelines();
        const prevRONsOwners = _.map(prevRONs, 'userId');
        const usersSubscribedToLikeFeed = await dbAdapter.getUsersSubscribedToTimelines([likesTimeline.id]);
        usersSubscribedToLikeFeed.push(user.id); // user always implicitly subscribed to their feeds
        const newRONsOwners = _.difference(usersSubscribedToLikeFeed, prevRONsOwners);
        await dbAdapter.setLocalBumpForUsers(this.id, newRONsOwners);
      }

      await dbAdapter.insertPostIntoFeeds([likesTimeline.intId], this.id);

      // Send realtime notifications
      await pubSub.newLike(this, user.id);

      return true;
    }

    /**
     * Removes like from post. This method does not performs any access check.
     * It returns true on success and false if this post was not already
     * liked by this user.
     *
     * @param {User} user
     * @returns {boolean}
     */
    async removeLike(user) {
      const success = await dbAdapter.unlikePost(this.id, user.id);
      if (!success) {
        return false;
      }
      const [
        realtimeRooms,
        timelineId,
        ,
      ] = await Promise.all([
        getRoomsOfPost(this),
        user.getLikesTimelineIntId(),
        dbAdapter.statsLikeDeleted(user.id),
      ]);
      await dbAdapter.withdrawPostFromFeeds([timelineId], this.id);

      // Send realtime notifications
      await pubSub.removeLike(this.id, user.id, realtimeRooms);

      return true;
    }

    async isBannedFor(userId) {
      const user = await dbAdapter.getUserById(userId);
      const banIds = await user.getBanIds();

      return banIds.includes(this.userId);
    }

    async isHiddenIn(timeline) {
      // hides are applicable only to river
      if (!(timeline.isRiverOfNews() || timeline.isHides())) {
        return false;
      }

      const owner = await timeline.getUser();
      const hidesTimelineIntId = await owner.getHidesTimelineIntId();

      return dbAdapter.isPostPresentInTimeline(hidesTimelineIntId, this.id);
    }

    async canShow(readerId, checkOnlyDestinations = true) {
      let timelines = await (checkOnlyDestinations ? this.getPostedTo() : this.getTimelines());

      if (!checkOnlyDestinations) {
        timelines = timelines.filter((timeline) => timeline.isPosts() || timeline.isDirects());
      }

      if (timelines.map((timeline) => timeline.userId).includes(readerId)) {
        // one of the timelines belongs to the user
        return true;
      }

      // skipping someone else's directs
      const nonDirectTimelines = timelines.filter((timeline) => !timeline.isDirects());

      if (nonDirectTimelines.length === 0) {
        return false;
      }

      const ownerIds = nonDirectTimelines.map((timeline) => timeline.userId);
      if (await dbAdapter.someUsersArePublic(ownerIds, !readerId)) {
        return true;
      }

      if (!readerId) {
        // no public feeds. anonymous can't see
        return false;
      }

      const timelineIds = nonDirectTimelines.map((timeline) => timeline.id);
      return await dbAdapter.isUserSubscribedToOneOfTimelines(readerId, timelineIds);
    }

    async processHashtagsOnCreate() {
      const postTags = _.uniq(extractHashtags(this.body.toLowerCase()));

      if (!postTags || postTags.length == 0) {
        return;
      }
      await dbAdapter.linkPostHashtagsByNames(postTags, this.id);
    }

    async processHashtagsOnUpdate() {
      const linkedPostHashtags = await dbAdapter.getPostHashtags(this.id);

      const presentTags    = _.sortBy(linkedPostHashtags.map((t) => t.name));
      const newTags        = _.sortBy(_.uniq(extractHashtags(this.body.toLowerCase())));
      const notChangedTags = _.intersection(presentTags, newTags);
      const tagsToUnlink   = _.difference(presentTags, notChangedTags);
      const tagsToLink     = _.difference(newTags, notChangedTags);

      if (presentTags != newTags) {
        if (tagsToUnlink.length > 0) {
          await dbAdapter.unlinkPostHashtagsByNames(tagsToUnlink, this.id);
        }
        if (tagsToLink.length > 0) {
          await dbAdapter.linkPostHashtagsByNames(tagsToLink, this.id);
        }
      }
    }

    /**
     * Filter users that can not see this post
     *
     * Viewer CAN NOT see post if:
     * - viwer is anonymous and post is not public or
     * - viewer is authorized and
     *   - post author banned viewer or was banned by viewer or
     *   - post is private and viewer cannot read any of post's destination feeds
     */
    async onlyUsersCanSeePost(users) {
      if (users.length === 0) {
        return [];
      }

      if (this.isProtected === '1') {
        // Anonymous can not see this post
        users = users.filter((u) => !!u.id); // users without id are anonymous
      }

      const authorBans = await dbAdapter.getBansAndBannersOfUser(this.userId);
      // Author's banned and banners can not see this post
      users = users.filter((u) => !authorBans.includes(u.id));

      if (this.isPrivate === '1') {
        const allowedUserIds = await dbAdapter.getUsersWhoCanSeePrivateFeeds(this.destinationFeedIds);
        users = users.filter((u) => allowedUserIds.includes(u.id));
      }

      return users;
    }
  }

  return Post;
}

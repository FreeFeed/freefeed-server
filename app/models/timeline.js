/* eslint babel/semi: "error" */
import _ from 'lodash';

/**
 * "Only friends" homefeed mode
 *
 * Displays posts from Posts/Directs feeds subscribed to by viewer.
 */
export const HOMEFEED_MODE_FRIENDS_ONLY = 'friends-only';

/**
 * "Classic" homefeed mode
 *
 * Displays posts from Posts/Directs feeds and propagable posts
 * from Comments/Likes feeds subscribed to by viewer.
 */
export const HOMEFEED_MODE_CLASSIC = 'classic';

/**
 * "All friends activity" homefeed mode
 *
 * Displays posts from Posts/Directs feeds and all (not only propagable) posts
 * from Comments/Likes feeds subscribed to by viewer. Also displays all posts
 * created by users subscribed to by viewer.
 */
export const HOMEFEED_MODE_FRIENDS_ALL_ACTIVITY = 'friends-all-activity';


export function addModel(dbAdapter) {
  class Timeline {
    id;
    intId;
    userId;
    user;
    createdAt;
    updatedAt;
    offset;
    limit;
    currentUser;
    name_;
    title;
    // The *inherent* feeds are created with account itself and cannot be
    // modified or deleted. If isInherent is false, the feed is *auxiliary*, and
    // it can be modified or deleted.
    isInherent;

    static defaultRiverOfNewsTitle = 'Home';

    constructor(params) {
      this.id = params.id;
      this.intId = params.intId;
      this.name = params.name;
      this.userId = params.userId;
      this.user = null;
      this.title = params.title || null;
      this.isInherent = params.ord === null;

      if (parseInt(params.createdAt, 10)) {
        this.createdAt = params.createdAt;
      }

      if (parseInt(params.updatedAt, 10)) {
        this.updatedAt = params.updatedAt;
      }

      this.offset = parseInt(params.offset, 10) || 0;
      this.limit = parseInt(params.limit, 10) || 30;
      this.currentUser = params.currentUser;
    }

    get name() {
      return this.name_;
    }

    set name(newValue) {
      if (!newValue) {
        this.name_ = '';
        return;
      }

      this.name_ = newValue.trim();
    }

    static getObjectsByIds(objectIds) {
      return dbAdapter.getTimelinesByIds(objectIds);
    }

    validate() {
      const valid = this.name
        && this.name.length > 0
        && this.userId
        && this.userId.length > 0;

      if (!valid) {
        throw new Error('Invalid');
      }
    }

    create() {
      return this._createTimeline();
    }

    async _createTimeline() {
      const currentTime = new Date().getTime();

      await this.validate();

      const payload = {
        'name':   this.name,
        'userId': this.userId,
      };

      const ids = await dbAdapter.createTimeline(payload);
      this.id = ids.id;
      this.intId = ids.intId;

      this.createdAt = currentTime;
      this.updatedAt = currentTime;

      return this;
    }

    async getPostIds(offset, limit) {
      if (_.isUndefined(offset)) {
        ({ offset } = this);
      } else if (offset < 0) {
        offset = 0;
      }

      // -1 = special magic number, meaning “do not use limit defaults,
      // do not use passed in value, use 0 instead". this is at the very least
      // used in Timeline.mergeTo()
      if (_.isUndefined(limit)) {
        ({ limit } = this);
      } else if (limit < 0) {
        limit = 0;
      }

      const valid = await this.canShow(this.currentUser);

      if (!valid) {
        return [];
      }

      this.postIds = await dbAdapter.getTimelinePostsRange(this.intId, offset, limit);
      return this.postIds;
    }

    async getFeedPosts(offset, limit, params, customFeedIds) {
      const valid = await this.canShow(this.currentUser);

      if (!valid) {
        return [];
      }

      let feedIds = [this.intId];

      if (customFeedIds) {
        feedIds = customFeedIds;
      }

      return dbAdapter.getFeedsPostsRange(feedIds, offset, limit, params);
    }

    async getPosts(offset, limit) {
      if (_.isUndefined(offset)) {
        ({ offset } = this);
      } else if (offset < 0) {
        offset = 0;
      }

      // -1 = special magic number, meaning “do not use limit defaults,
      // do not use passed in value, use 0 instead". this is at the very least
      // used in Timeline.mergeTo()
      if (_.isUndefined(limit)) {
        ({ limit } = this);
      } else if (limit < 0) {
        limit = 0;
      }

      const reader = this.currentUser ? (await dbAdapter.getUserById(this.currentUser)) : null;
      const banIds = reader ? (await reader.getBanIds()) : [];
      const readerOwnFeeds = reader ? (await reader.getPublicTimelinesIntIds()) : [];
      const feedOwner = await this.getUser();

      let posts;

      if (this.name !== 'MyDiscussions') {
        posts = await this.getFeedPosts(0, offset + limit, { currentUser: this.currentUser });
      } else {
        const myDiscussionsFeedSourcesIds = await Promise.all([feedOwner.getCommentsTimelineIntId(), feedOwner.getLikesTimelineIntId()]);
        posts = await this.getFeedPosts(0, offset + limit, { currentUser: this.currentUser }, myDiscussionsFeedSourcesIds);
      }

      const postIds = posts.map((p) => {
        return p.id;
      });

      if (reader && this.name === 'RiverOfNews') {
        let oldestPostTime;

        if (posts[posts.length - 1]) {
          oldestPostTime = posts[posts.length - 1].bumpedAt;
        }

        const localBumps = await dbAdapter.getUserLocalBumps(reader.id, oldestPostTime);
        const localBumpedPostIds = localBumps.map((bump) => bump.postId);

        const absentPostIds = _.difference(localBumpedPostIds, postIds);

        if (absentPostIds.length > 0) {
          let localBumpedPosts = await dbAdapter.getPostsByIds(absentPostIds, { currentUser: this.currentUser });
          localBumpedPosts = _.sortBy(localBumpedPosts, (post) => {
            return absentPostIds.indexOf(post.id);
          });
          posts = localBumpedPosts.concat(posts);
        }

        for (const p of posts) {
          if (localBumpedPostIds.includes(p.id)) {
            const bump = localBumps.find((b) => b.postId === p.id);
            p.locallyBumpedAt = bump.bumpedAt;
          }
        }
      }

      posts.sort((p1, p2) => {
        const t1 = Math.max(p1.locallyBumpedAt || 0, p1.bumpedAt);
        const t2 = Math.max(p2.locallyBumpedAt || 0, p2.bumpedAt);

        return t2 - t1;
      });

      posts = posts.slice(offset, offset + limit);

      const uids = _.uniq(posts.map((post) => post.userId));
      const users = (await dbAdapter.getUsersByIds(uids)).filter(Boolean);
      const readerUserId = this.currentUser;
      const banMatrix = await dbAdapter.getBanMatrixByUsersForPostReader(uids, readerUserId);

      const usersCache = {};

      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        usersCache[user.id] = [user, banMatrix[i][1]];
      }

      async function userById(id) {
        if (!(id in usersCache)) {
          const user = await dbAdapter.getUserById(id);

          if (!user) {
            throw new Error(`no user for id=${id}`);
          }

          const bans = await user.getBanIds();
          const isReaderBanned = bans.includes(readerUserId);
          usersCache[id] = [user, isReaderBanned];
        }

        return usersCache[id];
      }

      posts = await Promise.all(posts.map(async (post) => {
        if (post.userId === this.currentUser) {
          // shortcut for the author
          return post;
        }

        let author, authorBannedReader;

        try {
          [author, authorBannedReader] = await userById(post.userId);
        } catch (e) {
          throw new Error(`did not find user-object of author of post with id=${post.id}\nPREVIOUS: ${e.message}`);
        }

        const readerBannedAuthor = banIds.includes(post.userId);

        if (readerBannedAuthor || authorBannedReader) {
          return null;
        }

        if (author.isPrivate) {
          if ((feedOwner.isPrivate !== '1' && this.isPosts()) || this.isDirects()) {
            return post;
          }

          if (_.intersection(post.destinationFeedIds, readerOwnFeeds).length > 0) {
            return post;
          }

          if (reader && _.intersection(post.destinationFeedIds, reader.subscribedFeedIds).length > 0) {
            return post;
          }

          if (!await post.isVisibleFor(reader)) {
            return null;
          }
        }

        return post;
      }));

      this.posts = posts.filter(Boolean);

      return this.posts;
    }

    async unmerge(feedIntId) {
      const postIds = await dbAdapter.getTimelinesIntersectionPostIds(this.intId, feedIntId);

      await Promise.all(_.flatten(postIds.map((postId) =>
        dbAdapter.withdrawPostFromFeeds([feedIntId], postId)
      )));

      return;
    }

    async getUser() {
      if (!this.user) {
        this.user = await dbAdapter.getFeedOwnerById(this.userId);
      }

      return this.user;
    }

    /**
     * Returns the IDs of users subscribed to this timeline, as a promise.
     */
    async getSubscriberIds(includeSelf) {
      let userIds = await dbAdapter.getTimelineSubscribersIds(this.id);

      // A user is always subscribed to their own posts timeline.
      if (includeSelf && (this.isPosts() || this.isDirects())) {
        userIds = _.uniq(userIds.concat([this.userId]));
      }

      this.subscriberIds = userIds;

      return userIds;
    }

    async getSubscribers(includeSelf) {
      let users = await dbAdapter.getTimelineSubscribers(this.intId);

      if (includeSelf && (this.isPosts() || this.isDirects())) {
        const currentUser = await dbAdapter.getUserById(this.userId);
        users = users.concat(currentUser);
      }

      this.subscribers = users;

      return this.subscribers;
    }

    async loadVisibleSubscribersAndAdmins(feedOwner, viewer) {
      if (!feedOwner || feedOwner.id != this.userId) {
        throw new Error('Wrong feed owner');
      }

      const feedOwnerSubscriberIds = await feedOwner.getSubscriberIds();

      if (feedOwner.isPrivate !== '1') {
        return;
      }

      if (viewer && (viewer.id == feedOwner.id || feedOwnerSubscriberIds.includes(viewer.id))) {
        return;
      }

      feedOwner.administrators = [];
      this.subscribers = [];
      this.user = feedOwner;
    }

    /**
     * Returns the list of the 'River of News' timelines of all subscribers to this
     * timeline.
     */
    async getSubscribedTimelineIds() {
      const subscribers = await this.getSubscribers(true);
      return await Promise.all(subscribers.map((subscriber) => subscriber.getRiverOfNewsTimelineId()));
    }

    async getSubscribersRiversOfNewsIntIds() {
      const subscribers = await this.getSubscribers(true);
      return await Promise.all(subscribers.map((subscriber) => subscriber.getRiverOfNewsTimelineIntId()));
    }

    isRiverOfNews() {
      return this.name === 'RiverOfNews';
    }

    isPosts() {
      return this.name === 'Posts';
    }

    isLikes() {
      return this.name === 'Likes';
    }

    isComments() {
      return this.name === 'Comments';
    }

    isDirects() {
      return this.name === 'Directs';
    }

    isHides() {
      return this.name === 'Hides';
    }

    isSaves() {
      return this.name === 'Saves';
    }

    /**
     * Personal timeline can be viewed only by its owner
     * @return {boolean}
     */
    isPersonal() {
      return [
        'RiverOfNews',
        'Hides',
        'Directs',
        'MyDiscussions',
        'Saves',
      ].includes(this.name);
    }

    /**
     * Virtual timeline is generated dynamically from other timelines
     * @return {boolean}
     */
    isVirtual() {
      return [
        'RiverOfNews',
        'MyDiscussions',
      ].includes(this.name);
    }

    /**
     * Material timeline is actually exists in post's feedIntIds
     * @return {boolean}
     */
    isMaterial() {
      return !this.isVirtual();
    }

    async canShow(readerId) {
      if (this.userId === readerId) {
        return true;  // owner can read her posts
      }

      if (this.isPersonal()) {
        return false;  // this is someone else's personal feed
      }

      const user = await this.getUser();

      if (!user) {
        throw new Error(`Feed without owner: ${this.id}`);
      }

      if (!user.isActive) {
        return false; // No one can read an inactive user feed
      }

      if (!readerId) {
        return (user.isProtected === '0');
      }

      if (user.isPrivate === '1') {
        // User can view post if and only if she is subscriber
        const subscriberIds = await dbAdapter.getUserSubscribersIds(user.id);
        // const subscriberIds = await this.getSubscriberIds();

        if (!subscriberIds.includes(readerId)) {
          return false;
        }
      }

      // Viewer cannot see feeds of users in ban relations with him
      const banIds = await dbAdapter.getUsersBansOrWasBannedBy(readerId);
      return !banIds.includes(user.id);
    }

    /**
     * Only auxiliary feeds can be destroyed!
     *
     * @param {object} [params] destroy parameters (may be different for
     * different feed types)
     * @returns {Promise<boolean>} sucess of operation
     */
    destroy(params) {
      return dbAdapter.destroyFeed(this.id, params);
    }

    /**
     * Only auxiliary feeds can be updated!
     *
     * @returns {Promise<boolean>} sucess of operation
     */
    async update({ title }) {
      const updated = await dbAdapter.updateFeed(this.id, { title });

      if (!updated) {
        return false;
      }

      for (const key of Object.keys(updated)) {
        this[key] = updated[key];
      }

      return true;
    }

    updateHomeFeedSubscriptions(userIds) {
      return dbAdapter.updateHomeFeedSubscriptions(this.id, userIds);
    }

    getHomeFeedSubscriptions() {
      return dbAdapter.getHomeFeedSubscriptions(this.id);
    }
  }

  return Timeline;
}

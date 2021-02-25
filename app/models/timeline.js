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
      const valid = this.name && this.name.length > 0 && this.userId && this.userId.length > 0;

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
        name: this.name,
        userId: this.userId,
      };

      const ids = await dbAdapter.createTimeline(payload);
      this.id = ids.id;
      this.intId = ids.intId;

      this.createdAt = currentTime;
      this.updatedAt = currentTime;

      return this;
    }

    async unmerge(feedIntId) {
      const postIds = await dbAdapter.getTimelinesIntersectionPostIds(this.intId, feedIntId);

      await Promise.all(
        _.flatten(postIds.map((postId) => dbAdapter.withdrawPostFromFeeds([feedIntId], postId))),
      );

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
      return await Promise.all(
        subscribers.map((subscriber) => subscriber.getRiverOfNewsTimelineId()),
      );
    }

    async getSubscribersRiversOfNewsIntIds() {
      const subscribers = await this.getSubscribers(true);
      return await Promise.all(
        subscribers.map((subscriber) => subscriber.getRiverOfNewsTimelineIntId()),
      );
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
      return ['RiverOfNews', 'Hides', 'Directs', 'MyDiscussions', 'Saves'].includes(this.name);
    }

    /**
     * Virtual timeline is generated dynamically from other timelines
     * @return {boolean}
     */
    isVirtual() {
      return ['RiverOfNews', 'MyDiscussions'].includes(this.name);
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
        return true; // owner can read her posts
      }

      if (this.isPersonal()) {
        return false; // this is someone else's personal feed
      }

      const user = await this.getUser();

      if (!user) {
        throw new Error(`Feed without owner: ${this.id}`);
      }

      if (!user.isActive) {
        return false; // No one can read an inactive user feed
      }

      if (!readerId) {
        return user.isProtected === '0';
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

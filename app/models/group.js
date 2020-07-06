import { User, PubSub as pubSub } from '../models';
import { ForbiddenException } from '../support/exceptions';


export function addModel(dbAdapter) {
  return class Group extends User {
    // Groups only have 'Posts' feed
    static feedNames = ['Posts'];

    type = 'group';

    constructor(params) {
      super(params);

      this.isRestricted = params.isRestricted;
    }

    get isRestricted() {
      return this.isRestricted_;
    }
    set isRestricted(newValue) {
      this.isRestricted_ = newValue || '0';
    }

    isValidUsername(skip_stoplist) {
      const valid =
        this.username &&
        this.username.length >= 3 && // per spec
        this.username.length <= 35 && // per evidence and consensus
        this.username.match(/^[A-Za-z0-9]+(-[a-zA-Z0-9]+)*$/) &&
        !User.stopList(skip_stoplist).includes(this.username);

      return valid;
    }

    validate(skip_stoplist) {
      if (!this.isValidUsername(skip_stoplist)) {
        throw new Error('Invalid username');
      }

      if (!this.isValidScreenName()) {
        throw new Error(
          `"${
            this.screenName
          }" is not a valid display name. Names must be between 3 and 25 characters long.`
        );
      }

      if (!this.isValidDescription()) {
        throw new Error('Description is too long');
      }
    }

    async create(ownerId, skip_stoplist) {
      this.createdAt = new Date().getTime();
      this.updatedAt = new Date().getTime();
      this.screenName = this.screenName || this.username;

      await this.validateOnCreate(skip_stoplist);

      const payload = {
        username:     this.username,
        screenName:   this.screenName,
        description:  this.description,
        type:         this.type,
        createdAt:    this.createdAt.toString(),
        updatedAt:    this.updatedAt.toString(),
        isPrivate:    this.isPrivate,
        isProtected:  this.isProtected,
        isRestricted: this.isRestricted
      };
      [this.id, this.intId] = await dbAdapter.createUser(payload);

      await dbAdapter.createUserTimelines(this.id, Group.feedNames);

      if (ownerId) {
        await this.addAdministrator(ownerId);
        await this.subscribeOwner(ownerId);
      }

      return this;
    }

    async update(params) {
      let hasChanges = false;

      if (
        params.hasOwnProperty('screenName') &&
        this.screenName != params.screenName
      ) {
        if (!this.screenNameIsValid(params.screenName)) {
          throw new Error(
            `"${
              params.screenName
            }" is not a valid display name. Names must be between 3 and 25 characters long.`
          );
        }

        this.screenName = params.screenName;
        hasChanges = true;
      }

      if (
        params.hasOwnProperty('description') &&
        params.description != this.description
      ) {
        if (!User.descriptionIsValid(params.description)) {
          throw new Error('Description is too long');
        }

        this.description = params.description;
        hasChanges = true;
      }

      if (
        params.hasOwnProperty('isPrivate') &&
        params.isPrivate != this.isPrivate
      ) {
        this.isPrivate = params.isPrivate;
        hasChanges = true;
      }

      // Compatibility with pre-isProtected clients:
      // if there is only isPrivate param then isProtected becomes the same as isPrivate
      if (
        params.hasOwnProperty('isPrivate') &&
        (!params.hasOwnProperty('isProtected') || params.isPrivate === '1')
      ) {
        params.isProtected = params.isPrivate;
      }

      if (
        params.hasOwnProperty('isProtected') &&
        params.isProtected != this.isProtected
      ) {
        this.isProtected = params.isProtected;
        hasChanges = true;
      }

      if (
        params.hasOwnProperty('isRestricted') &&
        params.isRestricted != this.isRestricted
      ) {
        this.isRestricted = params.isRestricted;
        hasChanges = true;
      }

      if (hasChanges) {
        this.updatedAt = new Date().getTime();

        const payload = {
          screenName:   this.screenName,
          description:  this.description,
          updatedAt:    this.updatedAt.toString(),
          isPrivate:    this.isPrivate,
          isProtected:  this.isProtected,
          isRestricted: this.isRestricted
        };

        await dbAdapter.updateUser(this.id, payload);
        await pubSub.globalUserUpdate(this.id);
      }

      return this;
    }

    async subscribeOwner(ownerId) {
      const owner = await dbAdapter.getUserById(ownerId);

      if (!owner) {
        return null;
      }

      return await owner.subscribeTo(this, { noEvents: true });
    }

    addAdministrator(feedId) {
      return dbAdapter.addAdministratorToGroup(this.id, feedId);
    }

    async removeAdministrator(feedId) {
      const admins = await this.getActiveAdministrators();

      if (!admins.some((a) => a.id === feedId)) {
        throw new ForbiddenException('Not an administrator');
      }

      if (admins.length == 1) {
        throw new ForbiddenException('Cannot remove last administrator');
      }

      return dbAdapter.removeAdministratorFromGroup(this.id, feedId);
    }

    async getAdministratorIds() {
      this.administratorIds = await dbAdapter.getGroupAdministratorsIds(
        this.id
      );
      return this.administratorIds;
    }

    async getAdministrators() {
      const adminIds = await this.getAdministratorIds();
      this.administrators = await dbAdapter.getUsersByIds(adminIds);

      return this.administrators;
    }

    async getActiveAdministrators() {
      return (await this.getAdministrators()).filter((admin) => admin.isActive);
    }

    /**
     * Always returns false for groups (groups cannot receive directs).
     *
     * @returns {boolean}
     */
    acceptsDirectsFrom() {
      return false;
    }

    /**
     * Checks if the specified user can post to the timeline of this group
     * and returns array of destination timelines or empty array if
     * user can not post to this group.
     *
     * @param {string} postingUser
     * @returns {Timeline[]}
     */
    async getFeedsToPost(postingUser) {
      const timeline = await dbAdapter.getUserNamedFeed(this.id, 'Posts');
      const isSubscribed = await dbAdapter.isUserSubscribedToTimeline(
        postingUser.id,
        timeline.id
      );

      if (!isSubscribed) {
        return [];
      }

      const admins = await this.getActiveAdministrators();

      if (
        admins.length === 0 ||
        (this.isRestricted === '1' && !admins.some((a) => a.id === postingUser.id))
      ) {
        return [];
      }

      return [timeline];
    }
  };
}

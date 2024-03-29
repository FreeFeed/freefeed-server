import { User, PubSub as pubSub } from '../models';
import { EventService } from '../support/EventService';
import { ForbiddenException, ValidationException } from '../support/exceptions';

/**
 * @typedef { import('../support/DbAdapter').DbAdapter } DbAdapter
 * @typedef { import('../models').Group } Group
 * @typedef { import('../models').Timeline } Timeline
 * @typedef { import('../support/types').UUID } UUID
 */

/**
 * @param {DbAdapter} dbAdapter
 * @returns {Group}
 */
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
        throw new ValidationException('Invalid username');
      }

      if (!this.isValidScreenName()) {
        throw new ValidationException(
          `"${this.screenName}" is not a valid display name. Names must be between 3 and 25 characters long.`,
        );
      }

      if (!this.isValidDescription()) {
        throw new ValidationException('Description is too long');
      }
    }

    async create(ownerId, skip_stoplist) {
      this.screenName = this.screenName || this.username;

      await this.validateOnCreate(skip_stoplist);

      const payload = {
        username: this.username,
        screenName: this.screenName,
        description: this.description,
        type: this.type,
        isPrivate: this.isPrivate,
        isProtected: this.isProtected,
        isRestricted: this.isRestricted,
      };
      const newAcc = await dbAdapter.createUser(payload);

      for (const key of ['id', 'intId', 'createdAt', 'updatedAt']) {
        this[key] = newAcc[key];
      }

      await dbAdapter.createUserTimelines(this.id, Group.feedNames);

      if (ownerId) {
        await this.addAdministrator(ownerId);
        await this.subscribeOwner(ownerId);
      }

      return this;
    }

    async update(params) {
      let hasChanges = false;

      if (params.hasOwnProperty('screenName') && this.screenName != params.screenName) {
        if (!this.screenNameIsValid(params.screenName)) {
          throw new ValidationException(
            `"${params.screenName}" is not a valid display name. Names must be between 3 and 25 characters long.`,
          );
        }

        this.screenName = params.screenName;
        hasChanges = true;
      }

      if (params.hasOwnProperty('description') && params.description != this.description) {
        if (!User.descriptionIsValid(params.description)) {
          throw new ValidationException('Description is too long');
        }

        this.description = params.description;
        hasChanges = true;
      }

      if (params.hasOwnProperty('isPrivate') && params.isPrivate != this.isPrivate) {
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

      if (params.hasOwnProperty('isProtected') && params.isProtected != this.isProtected) {
        this.isProtected = params.isProtected;
        hasChanges = true;
      }

      if (params.hasOwnProperty('isRestricted') && params.isRestricted != this.isRestricted) {
        this.isRestricted = params.isRestricted;
        hasChanges = true;
      }

      if (hasChanges) {
        this.updatedAt = new Date().getTime();

        const payload = {
          screenName: this.screenName,
          description: this.description,
          updatedAt: this.updatedAt.toString(),
          isPrivate: this.isPrivate,
          isProtected: this.isProtected,
          isRestricted: this.isRestricted,
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

    async disableBansFor(userId, initiatorId = userId) {
      const ok = await dbAdapter.disableBansInGroup(userId, this.id, true);

      if (ok) {
        await EventService.onBansInGroupDisabled(this, userId, initiatorId);
      }
    }

    async enableBansFor(userId, initiatorId = userId) {
      const ok = await dbAdapter.disableBansInGroup(userId, this.id, false);

      if (ok) {
        await EventService.onBansInGroupEnabled(this, userId, initiatorId);
      }
    }

    async addAdministrator(adminId) {
      await dbAdapter.addAdministratorToGroup(this.id, adminId);
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
      this.administratorIds = await dbAdapter.getGroupAdministratorsIds(this.id);
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
     * Blocks user in the group. adminId is the id of the admin who blocking the
     * user. This method doesn't perform any access checks, it even doesn't
     * check if the admin is actually a group administrator. Returns true if the
     * user is blocked by this call, false if the user is already blocked.
     *
     * @param {UUID} userId
     * @param {UUID} adminId
     * @returns {Promise<boolean>}
     */
    async blockUser(userId, adminId) {
      const ok = await dbAdapter.blockUserInGroup(userId, this.id);

      if (!ok) {
        return false;
      }

      await EventService.onBlockedInGroup(this, userId, adminId);
      await pubSub.globalUserUpdate(this.id);

      return true;
    }

    /**
     * Unblocks user in the group. adminId is the id of the admin who unblocking
     * the user. This method doesn't perform any access checks, it even doesn't
     * check if the admin is actually a group administrator. Returns true if the
     * user is unblocked by this call, false if the user is already not blocked.
     *
     * @param {UUID} userId
     * @param {UUID} adminId
     * @returns {Promise<boolean>}
     */
    async unblockUser(userId, adminId) {
      const ok = await dbAdapter.unblockUserInGroup(userId, this.id);

      if (!ok) {
        return false;
      }

      await EventService.onUnblockedInGroup(this, userId, adminId);
      await pubSub.globalUserUpdate(this.id);

      return true;
    }
  };
}

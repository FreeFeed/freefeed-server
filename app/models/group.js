import { inherits } from 'util'

import _ from 'lodash'

import { User } from '../models'
import { ForbiddenException } from '../support/exceptions'


export function addModel(dbAdapter) {
  /**
   * @constructor
   * @extends User
   */
  const Group = function (params) {
    this.id = params.id
    this.username = params.username
    this.screenName = params.screenName
    this.description = params.description || ''
    this.createdAt = params.createdAt
    this.updatedAt = params.updatedAt
    this.isPrivate = params.isPrivate
    this.isProtected = params.isProtected
    if (this.isPrivate === '1') {
      this.isProtected = '1'
    }
    this.isRestricted = params.isRestricted
    this.type = 'group'
    this.profilePictureUuid = params.profilePictureUuid || ''
  }

  inherits(Group, User)

  Group.className = Group
  Group.namespace = 'user'

  Reflect.defineProperty(Group.prototype, 'username', {
    get: function () { return this.username_ },
    set: function (newValue) {
      if (newValue)
        this.username_ = newValue.trim().toLowerCase()
    }
  })

  Reflect.defineProperty(Group.prototype, 'screenName', {
    get: function () { return this.screenName_ },
    set: function (newValue) {
      if (_.isString(newValue))
        this.screenName_ = newValue.trim()
    }
  })

  Reflect.defineProperty(Group.prototype, 'description', {
    get: function () { return this.description_ },
    set: function (newValue) {
      if (_.isString(newValue))
        this.description_ = newValue.trim()
    }
  })

  Reflect.defineProperty(Group.prototype, 'isRestricted', {
    get: function () { return this.isRestricted_ },
    set: function (newValue) {
      this.isRestricted_ = newValue || '0'
    }
  })

  Group.prototype.isValidUsername = function (skip_stoplist) {
    const valid = this.username
        && this.username.length >= 3   // per spec
        && this.username.length <= 35  // per evidence and consensus
        && this.username.match(/^[A-Za-z0-9]+(-[a-zA-Z0-9]+)*$/)
        && !User.stopList(skip_stoplist).includes(this.username)

    return valid
  }

  Group.prototype.validate = async function (skip_stoplist) {
    if (!this.isValidUsername(skip_stoplist)) {
      throw new Error('Invalid username')
    }

    if (!this.isValidScreenName()) {
      throw new Error(`"${this.screenName}" is not a valid display name. Names must be between 3 and 25 characters long.`)
    }

    if (!this.isValidDescription()) {
      throw new Error('Description is too long')
    }
  }

  Group.prototype.create = async function (ownerId, skip_stoplist) {
    this.createdAt = new Date().getTime()
    this.updatedAt = new Date().getTime()
    this.screenName = this.screenName || this.username

    await this.validateOnCreate(skip_stoplist)

    const payload = {
      'username':     this.username,
      'screenName':   this.screenName,
      'description':  this.description,
      'type':         this.type,
      'createdAt':    this.createdAt.toString(),
      'updatedAt':    this.updatedAt.toString(),
      'isPrivate':    this.isPrivate,
      'isProtected':  this.isProtected,
      'isRestricted': this.isRestricted
    }
    this.id = await dbAdapter.createUser(payload)

    await dbAdapter.createUserTimelines(this.id, ['RiverOfNews', 'Hides', 'Comments', 'Likes', 'Posts'])

    if (ownerId) {
      await this.addAdministrator(ownerId)
      await this.subscribeOwner(ownerId)
    }

    return this
  }

  Group.prototype.update = async function (params) {
    let hasChanges = false

    if (params.hasOwnProperty('screenName') && this.screenName != params.screenName) {
      if (!this.screenNameIsValid(params.screenName)) {
        throw new Error(`"${params.screenName}" is not a valid display name. Names must be between 3 and 25 characters long.`)
      }

      this.screenName = params.screenName
      hasChanges = true
    }

    if (params.hasOwnProperty('description') && params.description != this.description) {
      if (!User.descriptionIsValid(params.description)) {
        throw new Error('Description is too long')
      }

      this.description = params.description
      hasChanges = true
    }

    if (params.hasOwnProperty('isPrivate') && params.isPrivate != this.isPrivate) {
      this.isPrivate = params.isPrivate
      hasChanges = true
    }

    // Compatibility with pre-isProtected clients:
    // if there is only isPrivate param then isProtected becomes the same as isPrivate
    if (params.hasOwnProperty('isPrivate') && (!params.hasOwnProperty('isProtected') || params.isPrivate === '1')) {
      params.isProtected = params.isPrivate
    }

    if (params.hasOwnProperty('isProtected') && params.isProtected != this.isProtected) {
      this.isProtected = params.isProtected
      hasChanges = true
    }

    if (params.hasOwnProperty('isRestricted') && params.isRestricted != this.isRestricted) {
      this.isRestricted = params.isRestricted
      hasChanges = true
    }

    if (hasChanges) {
      this.updatedAt = new Date().getTime()

      const payload = {
        'screenName':   this.screenName,
        'description':  this.description,
        'updatedAt':    this.updatedAt.toString(),
        'isPrivate':    this.isPrivate,
        'isProtected':  this.isProtected,
        'isRestricted': this.isRestricted
      }

      await dbAdapter.updateUser(this.id, payload)
    }

    return this
  }

  Group.prototype.subscribeOwner = async function (ownerId) {
    const owner = await dbAdapter.getUserById(ownerId)

    if (!owner) {
      return null
    }

    const timelineId = await this.getPostsTimelineId()
    const res = await owner.subscribeTo(timelineId)

    return res
  }

  Group.prototype.addAdministrator = function (feedId) {
    return dbAdapter.addAdministratorToGroup(this.id, feedId)
  }

  Group.prototype.removeAdministrator = async function (feedId) {
    const adminIds = await this.getAdministratorIds()

    if (!adminIds.includes(feedId)) {
      throw new Error('Not an administrator')
    }

    if (adminIds.length == 1) {
      throw new Error('Cannot remove last administrator')
    }

    return dbAdapter.removeAdministratorFromGroup(this.id, feedId)
  }

  Group.prototype.getAdministratorIds = async function () {
    this.administratorIds = await dbAdapter.getGroupAdministratorsIds(this.id)
    return this.administratorIds
  }

  Group.prototype.getAdministrators = async function () {
    const adminIds = await this.getAdministratorIds()
    this.administrators = await dbAdapter.getUsersByIds(adminIds)

    return this.administrators
  }

  /**
   * Checks if the specified user can post to the timeline of this group.
   */
  Group.prototype.validateCanPost = async function (postingUser) {
    const timeline = await this.getPostsTimeline()
    const ids = await timeline.getSubscriberIds()

    if (!ids.includes(postingUser.id)) {
      throw new ForbiddenException("You can't post to a group to which you aren't subscribed")
    }

    if (this.isRestricted === '1') {
      const adminIds = await this.getAdministratorIds()
      if (!adminIds.includes(postingUser.id)) {
        throw new ForbiddenException("You can't post to a restricted group")
      }
    }
  }

  return Group
}

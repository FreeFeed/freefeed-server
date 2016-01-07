import { inherits } from "util"

import _ from 'lodash'

import { FeedFactory, Stats, User } from '../models'
import { ForbiddenException } from '../support/exceptions'


export function addModel(dbAdapter) {
  /**
   * @constructor
   * @extends User
   */
  var Group = function(params) {
    this.id = params.id
    this.username = params.username
    this.screenName = params.screenName
    this.createdAt = params.createdAt
    this.updatedAt = params.updatedAt
    this.isPrivate = params.isPrivate
    this.type = "group"
    this.profilePictureUuid = params.profilePictureUuid || ''
  }

  inherits(Group, User)

  Group.className = Group
  Group.namespace = "user"
  Group.initObject = Group.super_.initObject
  Group.findById = Group.super_.findById
  Group.findByIds = Group.super_.findByIds
  Group.getById = Group.super_.getById
  Group.findByAttribute = Group.super_.findByAttribute
  Group.findByUsername = Group.super_.findByUsername

  Object.defineProperty(Group.prototype, 'username', {
    get: function() { return this.username_ },
    set: function(newValue) {
      if (newValue)
        this.username_ = newValue.trim().toLowerCase()
    }
  })

  Object.defineProperty(Group.prototype, 'screenName', {
    get: function() { return this.screenName_ },
    set: function(newValue) {
      if (_.isString(newValue))
        this.screenName_ = newValue.trim()
    }
  })

  Group.prototype.isValidUsername = function(skip_stoplist) {
    var valid = this.username
        && this.username.length >= 3   // per spec
        && this.username.length <= 35  // per evidence and consensus
        && this.username.match(/^[A-Za-z0-9]+(-[a-zA-Z0-9]+)*$/)
        && FeedFactory.stopList(skip_stoplist).indexOf(this.username) == -1

    return valid
  }

  Group.prototype.validate = async function(skip_stoplist) {
    if (!this.isValidUsername(skip_stoplist)) {
      throw new Error('Invalid username')
    }

    if (!this.isValidScreenName()) {
      throw new Error('Invalid screenname')
    }
  }

  Group.prototype.create = async function(ownerId, skip_stoplist) {
      this.createdAt = new Date().getTime()
      this.updatedAt = new Date().getTime()
      this.screenName = this.screenName || this.username

      var group = await this.validateOnCreate(skip_stoplist)

      let payload = {
        'username':   group.username,
        'screenName': group.screenName,
        'type':       group.type,
        'createdAt':  group.createdAt.toString(),
        'updatedAt':  group.updatedAt.toString(),
        'isPrivate':  group.isPrivate
      }
      this.id = await dbAdapter.createUser(payload)

      var stats = new Stats({
        id: this.id
      })

      let promises = [stats.create()]

      if (ownerId) {
        promises.push(this.addAdministrator(ownerId))
        promises.push(this.subscribeOwner(ownerId))
      }

      await Promise.all(promises)

      return this
  }

  Group.prototype.update = async function(params) {
    if (params.hasOwnProperty('screenName') && this.screenName != params.screenName) {
      if (!this.screenNameIsValid(params.screenName)) {
        throw new Error("Invalid screenname")
      }

      this.screenName = params.screenName
      this.updatedAt = new Date().getTime()

      var payload = {
        'screenName': this.screenName,
        'isPrivate':  this.isPrivate,
        'updatedAt':  this.updatedAt.toString()
      }

      await dbAdapter.updateUser(this.id, payload)
    }

    return this
  }

  Group.prototype.subscribeOwner = async function(ownerId) {
    let owner = await User.findById(ownerId)

    if (!owner) {
      return null
    }

    let timelineId = await this.getPostsTimelineId()
    let res = await owner.subscribeTo(timelineId)

    return res
  }

  Group.prototype.addAdministrator = function(feedId) {
    return dbAdapter.addAdministratorToGroup(this.id, feedId)
  }

  Group.prototype.removeAdministrator = async function(feedId) {
    let adminIds = await this.getAdministratorIds()

    if (adminIds.indexOf(feedId) == -1) {
      throw new Error("Not an administrator")
    }

    if (adminIds.length == 1) {
      throw new Error("Cannot remove last administrator")
    }

    return dbAdapter.removeAdministratorFromGroup(this.id, feedId)
  }

  Group.prototype.getAdministratorIds = async function() {
    this.administratorIds = await dbAdapter.getGroupAdministratorsIds(this.id)
    return this.administratorIds
  }

  Group.prototype.getAdministrators = async function() {
    var adminIds = await this.getAdministratorIds()
    this.administrators = await User.findByIds(adminIds)

    return this.administrators
  }

  /**
   * Checks if the specified user can post to the timeline of this group.
   */
  Group.prototype.validateCanPost = async function(postingUser) {
    let timeline = await this.getPostsTimeline()
    let ids = await timeline.getSubscriberIds()

    if (!_.includes(ids, postingUser.id)) {
      throw new ForbiddenException("You can't post to a group to which you aren't subscribed")
    }

    return this
  }

  /**
   * Checks if the specified user can update the settings of this group
   * (i.e. is an admin in the group).
   */
  Group.prototype.validateCanUpdate = async function(updatingUser) {
    if (!updatingUser) {
      throw new ForbiddenException("You need to log in before you can manage groups")
    }

    let adminIds = await this.getAdministratorIds()

    if (!_.includes(adminIds, updatingUser.id)) {
      throw new ForbiddenException("You aren't an administrator of this group")
    }

    return this
  }

  return Group
}

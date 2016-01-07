import { inherits } from "util"
import _crypto from 'crypto'

import _bcrypt from 'bcrypt'
import { promisifyAll } from 'bluebird'
import _gm from 'gm'
import GraphemeBreaker from 'grapheme-breaker'
import _ from 'lodash'
import monitor from 'monitor-dog'
import validator from 'validator'
import uuid from 'uuid'

import { load as configLoader } from "../../config/config"
import { BadRequestException, ForbiddenException } from '../support/exceptions'
import { AbstractModel, Attachment, Comment, FeedFactory, Post, Stats, Timeline } from '../models'


let bcrypt = promisifyAll(_bcrypt)
let gm = promisifyAll(_gm)

let config = configLoader()
let crypto = promisifyAll(_crypto)

exports.addModel = function(dbAdapter) {
  /**
   * @constructor
   */
  var User = function(params) {
    User.super_.call(this)

    var password = null

    this.id = params.id
    this.username = params.username
    this.screenName = params.screenName
    this.email = params.email

    if (!_.isUndefined(params.hashedPassword)) {
      this.hashedPassword = params.hashedPassword
    } else {
      password = params.password || ''
    }

    this.isPrivate = params.isPrivate
    this.resetPasswordToken = params.resetPasswordToken
    this.resetPasswordSentAt = params.resetPasswordSentAt
    if (parseInt(params.createdAt, 10))
      this.createdAt = params.createdAt
    if (parseInt(params.updatedAt, 10))
      this.updatedAt = params.updatedAt
    this.type = "user"

    this.profilePictureUuid = params.profilePictureUuid || ''

    this.initPassword = async function() {
      if (!_.isNull(password)) {
        if (password.length === 0) {
          throw new Error('Password cannot be blank')
        }

        this.hashedPassword = await bcrypt.hashAsync(password, 10)
        password = null
      }
      return this
    }
  }

  inherits(User, AbstractModel)

  User.className = User
  User.namespace = "user"
  User.initObject = User.super_.initObject
  User.findById = User.super_.findById
  User.findByIds = User.super_.findByIds
  User.getById = User.super_.getById
  User.findByAttribute = User.super_.findByAttribute

  User.PROFILE_PICTURE_SIZE_LARGE = 75
  User.PROFILE_PICTURE_SIZE_MEDIUM = 50
  User.PROFILE_PICTURE_SIZE_SMALL = 25

  Object.defineProperty(User.prototype, 'username', {
    get: function() { return this.username_ },
    set: function(newValue) {
      if (newValue)
        this.username_ = newValue.trim().toLowerCase()
    }
  })

  Object.defineProperty(User.prototype, 'screenName', {
    get: function() { return this.screenName_ },
    set: function(newValue) {
      if (_.isString(newValue))
        this.screenName_ = newValue.trim()
    }
  })

  Object.defineProperty(User.prototype, 'email', {
    get: function() { return _.isUndefined(this.email_) ? "" : this.email_ },
    set: function(newValue) {
      if (_.isString(newValue))
        this.email_ = newValue.trim()
    }
  })

  Object.defineProperty(User.prototype, 'isPrivate', {
    get: function() { return this.isPrivate_ },
    set: function(newValue) {
      this.isPrivate_ = newValue || '0'
    }
  })

  User.findByUsername = function(username) {
    return this.findByAttribute('username', username)
  }

  User.findByResetToken = function(token) {
    return this.findByAttribute('reset', token)
  }

  User.findByEmail = function(email) {
    return this.findByAttribute('email', email)
  }

  User.prototype.isUser = function() {
    return this.type === "user"
  }

  User.prototype.newPost = async function(attrs) {
    attrs.userId = this.id
    if (!attrs.timelineIds || !attrs.timelineIds[0]) {
      let timelineId = await this.getPostsTimelineId()
      attrs.timelineIds = [timelineId]
    }
    return new Post(attrs)
  }

  User.prototype.updateResetPasswordToken = async function() {
    let now = new Date().getTime()
    let oldToken = this.resetPasswordToken

    this.resetPasswordToken = await this.generateResetPasswordToken()

    let payload = {
      'resetPasswordToken': this.resetPasswordToken,
      'resetPasswordSentAt': now
    }

    let promises = [
      dbAdapter.updateUser(this.id, payload),
      dbAdapter.createUserResetPasswordToken(this.id, this.resetPasswordToken)
    ]

    if (oldToken) {
      promises.push(dbAdapter.deleteUserResetPasswordToken(oldToken))
    }

    await Promise.all(promises)

    let expireAfter = 60*60*24 // 24 hours
    await dbAdapter.setUserResetPasswordTokenExpireAfter(this.resetPasswordToken, expireAfter)

    return this.resetPasswordToken
  }

  User.prototype.generateResetPasswordToken = async function() {
    let buf = await crypto.randomBytesAsync(48)
    return buf.toString('hex')
  }

  User.prototype.validPassword = function(clearPassword) {
    return bcrypt.compareAsync(clearPassword, this.hashedPassword)
  }

  User.prototype.isValidEmail = async function() {
    return User.emailIsValid(this.email)
  }

  User.emailIsValid = async function(email) {
    // email is optional
    if (!email || email.length == 0) {
      return true
    }

    if (!validator.isEmail(email)) {
      return false
    }

    var uid = await dbAdapter.getUserIdByEmail(email)

    if (uid) {
      // email is taken
      return false
    }

    return true
  }

  User.prototype.isValidUsername = function(skip_stoplist) {
    var valid = this.username
        && this.username.length >= 3   // per the spec
        && this.username.length <= 25  // per the spec
        && this.username.match(/^[A-Za-z0-9]+$/)
        && FeedFactory.stopList(skip_stoplist).indexOf(this.username) == -1

    return valid
  }

  User.prototype.isValidScreenName = function() {
    return this.screenNameIsValid(this.screenName)
  }

  User.prototype.screenNameIsValid = function(screenName) {
    if (!screenName) {
      return false
    }

    var len = GraphemeBreaker.countBreaks(screenName)

    if (len < 3 || len > 25) {
      return false
    }

    return true
  }

  User.prototype.validate = async function(skip_stoplist) {
    if (!this.isValidUsername(skip_stoplist)) {
      throw new Error('Invalid username')
    }

    if (!this.isValidScreenName()) {
      throw new Error('Invalid screenname')
    }

    if (!await this.isValidEmail()) {
      throw new Error('Invalid email')
    }
  }

  User.prototype.validateUsernameUniqueness = async function() {
    let res = await dbAdapter.existsUsername(this.username)

    if (res !== 0)
      throw new Error("Already exists")
  }

  User.prototype.validateOnCreate = async function(skip_stoplist) {
    var promises = [
      this.validate(skip_stoplist),
      this.validateUsernameUniqueness()
    ];

    await Promise.all(promises)

    return this
  }

  //
  // Create database index from email to uid
  //
  User.prototype.createEmailIndex = function() {
    // email is optional, so no need to index an empty key
    if (this.email && this.email.length > 0) {
      return dbAdapter.createUserEmailIndex(this.id, this.email)
    }
    return new Promise.resolve(true)
  }

  User.prototype.dropIndexForEmail = function(email) {
    return dbAdapter.dropUserEmailIndex(email)
  }

  User.prototype.create = async function(skip_stoplist) {
    this.createdAt = new Date().getTime()
    this.updatedAt = new Date().getTime()
    this.screenName = this.screenName || this.username

    var user = await this.validateOnCreate(skip_stoplist)

    var timer = monitor.timer('users.create-time')
    await user.initPassword()

    let payload = {
      'username':       user.username,
      'screenName':     user.screenName,
      'email':          user.email,
      'type':           user.type,
      'isPrivate':      '0',
      'createdAt':      user.createdAt.toString(),
      'updatedAt':      user.updatedAt.toString(),
      'hashedPassword': user.hashedPassword
    }
    this.id = await dbAdapter.createUser(payload)

    var stats = new Stats({
      id: this.id
    })

    await stats.create()
    timer.stop() // @todo finally {}
    monitor.increment('users.creates')

    return this
  }

  User.prototype.update = async function(params) {
    var hasChanges = false
      , emailChanged = false
      , oldEmail = ""

    if (params.hasOwnProperty('screenName') && params.screenName != this.screenName) {
      if (!this.screenNameIsValid(params.screenName)) {
        throw new Error("Invalid screenname")
      }

      this.screenName = params.screenName
      hasChanges = true
    }

    if (params.hasOwnProperty('email') && params.email != this.email) {
      if (!(await User.emailIsValid(params.email))) {
        throw new Error("Invalid email")
      }

      oldEmail = this.email
      this.email = params.email

      hasChanges = true
      emailChanged = true
    }

    if (params.hasOwnProperty('isPrivate') && params.isPrivate != this.isPrivate) {
      if (params.isPrivate != '0' && params.isPrivate != '1') {
        // ???
        throw new Error("bad input")
      }

      if (params.isPrivate === '1' && this.isPrivate === '0')
        await this.unsubscribeNonFriends()
      else if (params.isPrivate === '0' && this.isPrivate === '1')
        await this.subscribeNonFriends()

      this.isPrivate = params.isPrivate
      hasChanges = true
    }

    if (hasChanges) {
      this.updatedAt = new Date().getTime()

      var payload = {
        'screenName': this.screenName,
        'email':      this.email,
        'isPrivate':  this.isPrivate,
        'updatedAt':  this.updatedAt.toString()
      }

      var promises = [
        dbAdapter.updateUser(this.id, payload)
      ]

      if (emailChanged) {
        if (oldEmail != "") {
          promises.push(this.dropIndexForEmail(oldEmail))
        }
        if (this.email != "") {
          promises.push(this.createEmailIndex())
        }
      }

      await Promise.all(promises)
    }

    return this
  }

  User.prototype.subscribeNonFriends = async function() {
    // NOTE: this method is super ineffective as it iterates all posts
    // and then all comments in user's timeline, we could make it more
    // efficient when introduce Entries table with meta column (post to
    // timelines many-to-many over Entries)

    let timeline = await this.getPostsTimeline({currentUser: this.id})
    let posts = await timeline.getPosts(0, -1)

    let fixedUsers = []

    // first of all, let's revive likes
    for (let post of posts) {
      let actions = []

      let [likes, comments] = await Promise.all([post.getLikes(), post.getComments()]);

      for (let usersChunk of _.chunk(likes, 10)) {
        let promises = usersChunk.map(async (user) => {
          let likesTimelineId = await user.getLikesTimelineId()
          let time = await dbAdapter.getUserPostLikedTime(user.id, post.id)

          actions.push(dbAdapter.addPostToTimeline(likesTimelineId, time, post.id))
          actions.push(dbAdapter.createPostUsageInTimeline(post.id, likesTimelineId))
        })

        await Promise.all(promises)
      }

      let uniqueCommenterUids = _.uniq(comments.map(comment => comment.userId))
      let commenters = await User.findByIds(uniqueCommenterUids)

      for (let usersChunk of _.chunk(commenters, 10)) {
        let promises = usersChunk.map(async (user) => {
          let commentsTimelineId = await user.getCommentsTimelineId()

          // NOTE: I'm cheating with time when we supposed to add that
          // post to comments timeline, but who notices this?
          let time = post.updatedAt

          actions.push(dbAdapter.addPostToTimeline(commentsTimelineId, time, post.id))
          actions.push(dbAdapter.createPostUsageInTimeline(post.id, commentsTimelineId))
        })

        await Promise.all(promises)
      }

      await Promise.all(actions)

      fixedUsers = _.uniq(fixedUsers.concat(likes).concat(commenters), 'id')
    }

    for (let usersChunk of _.chunk(fixedUsers, 10)) {
      let promises = usersChunk.map(async (user) => {
        let [riverId, commentsTimeline, likesTimeline] = await Promise.all([
          user.getRiverOfNewsTimelineId(),
          user.getCommentsTimeline(),
          user.getLikesTimeline()
        ])

        await commentsTimeline.mergeTo(riverId)
        await likesTimeline.mergeTo(riverId)
      })

      await Promise.all(promises)
    }
  }

  User.prototype.unsubscribeNonFriends = async function() {
    var subscriberIds = await this.getSubscriberIds()
    var timeline = await this.getPostsTimeline()

    // users that I'm not following are ex-followers now
    // var subscribers = await this.getSubscribers()
    // await Promise.all(subscribers.map(function(user) {
    //   // this is not friend, let's unsubscribe her before going to private
    //   if (subscriptionIds.indexOf(user.id) === -1) {
    //     return user.unsubscribeFrom(timeline.id, { likes: true, comments: true })
    //   }
    // }))

    // we need to review post by post as some strangers that are not
    // followers and friends could commented on or like my posts
    // let's find strangers first
    let posts = await timeline.getPosts(0, -1)

    let allUsers = []

    for (let post of posts) {
      let timelines = await post.getTimelines()
      let userPromises = timelines.map(timeline => timeline.getUser())
      let users = await Promise.all(userPromises)

      allUsers = _.uniq(allUsers.concat(users), 'id')
    }

    // and remove all private posts from all strangers timelines
    let users = _.filter(
      allUsers,
      user => (subscriberIds.indexOf(user.id) === -1 && user.id != this.id)
    )

    for (let chunk of _.chunk(users, 10)) {
      let actions = chunk.map(user => user.unsubscribeFrom(timeline.id, { likes: true, comments: true, skip: true }))
      await Promise.all(actions)
    }
  }

  User.prototype.updatePassword = async function(password, passwordConfirmation) {
    this.updatedAt = new Date().getTime()
    if (password.length === 0) {
      throw new Error('Password cannot be blank')
    } else if (password !== passwordConfirmation) {
      throw new Error("Passwords do not match")
    }

    try {
      this.hashedPassword = await bcrypt.hashAsync(password, 10)

      await dbAdapter.setUserPassword(this.id, this.updatedAt, this.hashedPassword)

      return this
    } catch(e) {
      throw e //? hmmm?
    }
  }

  User.prototype.getAdministratorIds = async function() {
    return [this.id]
  }

  User.prototype.getAdministrators = async function() {
    return [this]
  }

  User.prototype.getMyDiscussionsTimeline = async function(params) {
    var commentsId
      , likesId

    await Promise.join(
      this.getCommentsTimelineId(),
      this.getLikesTimelineId(),
      (cId, lId) => {
        commentsId = cId
        likesId = lId
      }
    )

    let myDiscussionsTimelineId = dbAdapter.getUserDiscussionsTimelineId(this.id)
    let timelineExists = await dbAdapter.existsTimeline(myDiscussionsTimelineId)
    if (!timelineExists){
      let timeline = new Timeline({
        name: "MyDiscussions",
        userId: this.id
      })

      timeline = await timeline.createUserDiscussionsTimeline()
      myDiscussionsTimelineId = timeline.id
    }

    await dbAdapter.createMergedPostsTimeline(myDiscussionsTimelineId, commentsId, likesId)

    return Timeline.findById(myDiscussionsTimelineId, params)
  }

  User.prototype.getGenericTimelineId = async function(name, params) {
    let timelineIds = await this.getTimelineIds()

    let timeline

    if (timelineIds[name]) {
      params = params || {}
      timeline = await Timeline.findById(timelineIds[name], {
        offset: params.offset,
        limit: params.limit
      })
    } else {
      timeline = new Timeline({
        name: name,
        userId: this.id
      })

      timeline = await timeline.create()
    }

    return timeline.id
  }

  User.prototype.getGenericTimeline = async function(name, params) {
    let timelineId = await this[`get${name}TimelineId`](params)

    let timeline = await Timeline.findById(timelineId, params)
    timeline.posts = await timeline.getPosts(timeline.offset, timeline.limit)

    return timeline
  }

  User.prototype.getHidesTimelineId = function(params) {
    return this.getGenericTimelineId('Hides', params)
  },

  User.prototype.getHidesTimeline = function(params) {
    return this.getGenericTimeline('Hides', params)
  }

  User.prototype.getRiverOfNewsTimelineId = function(params) {
    return this.getGenericTimelineId('RiverOfNews', params)
  }

  User.prototype.getRiverOfNewsTimeline = async function(params) {
    let timelineId = await this.getRiverOfNewsTimelineId(params)
    let hidesTimelineId = await this.getHidesTimelineId(params)

    let riverOfNewsTimeline = await Timeline.findById(timelineId, params)
    let banIds = await this.getBanIds()
    let posts = await riverOfNewsTimeline.getPosts(riverOfNewsTimeline.offset,
                                                   riverOfNewsTimeline.limit)

    riverOfNewsTimeline.posts = await Promise.all(posts.map(async (post) => {
      let postInTimeline = await dbAdapter.isPostPresentInTimeline(hidesTimelineId, post.id)

      if (postInTimeline) {
        post.isHidden = true
      }

      return banIds.indexOf(post.userId) >= 0 ? null : post
    }))

    return riverOfNewsTimeline
  }

  User.prototype.getLikesTimelineId = function(params) {
    return this.getGenericTimelineId('Likes', params)
  }

  User.prototype.getLikesTimeline = function(params) {
    return this.getGenericTimeline('Likes', params)
  }

  User.prototype.getPostsTimelineId = function(params) {
    return this.getGenericTimelineId('Posts', params)
  }

  User.prototype.getPostsTimeline = function(params) {
    return this.getGenericTimeline('Posts', params)
  }

  User.prototype.getCommentsTimelineId = function(params) {
    return this.getGenericTimelineId('Comments', params)
  }

  User.prototype.getCommentsTimeline = function(params) {
    return this.getGenericTimeline('Comments', params)
  }

  User.prototype.getDirectsTimelineId = function(params) {
    return this.getGenericTimelineId('Directs', params)
  }

  User.prototype.getDirectsTimeline = function(params) {
    return this.getGenericTimeline('Directs', params)
  }

  User.prototype.getTimelineIds = async function() {
    let timelineIds = await dbAdapter.getUserTimelinesIds(this.id)
    return timelineIds || {}
  }

  User.prototype.getTimelines = async function(params) {
    const timelineIds = await this.getTimelineIds()
    const timelines = await Timeline.findByIds(_.values(timelineIds), params)

    return timelines
  }

  User.prototype.getPublicTimelineIds = function(params) {
    return Promise.all([
      this.getCommentsTimelineId(params),
      this.getLikesTimelineId(params),
      this.getPostsTimelineId(params )
    ])
  }

  User.prototype.getSubscriptionIds = async function() {
    this.subscriptionsIds = await dbAdapter.getUserSubscriptionsIds(this.id)
    return this.subscriptionsIds
  }

  /**
   * @return {Timeline[]}
   */
  User.prototype.getSubscriptions = async function() {
    var timelineIds = await this.getSubscriptionIds()
    this.subscriptions = await Timeline.findByIds(timelineIds)

    return this.subscriptions
  }

  User.prototype.getFriendIds = async function() {
    var timelines = await this.getSubscriptions()
    timelines = _.filter(timelines, _.method('isPosts'))

    return timelines.map((timeline) => timeline.userId)
  }

  User.prototype.getFriends = async function() {
    var userIds = await this.getFriendIds()
    return await User.findByIds(userIds)
  }

  User.prototype.getSubscriberIds = async function() {
    var timeline = await this.getPostsTimeline()
    this.subscriberIds = await timeline.getSubscriberIds()

    return this.subscriberIds
  }

  User.prototype.getSubscribers = async function() {
    var subscriberIds = await this.getSubscriberIds()
    this.subscribers = await User.findByIds(subscriberIds)

    return this.subscribers
  }

  User.prototype.getBanIds = function() {
    return dbAdapter.getUserBansIds(this.id)
  }

  User.prototype.getBans = async function() {
    const userIds = await this.getBanIds()
    const users = await User.findByIds(userIds)

    return users
  }

  User.prototype.ban = async function(username) {
    var user = await User.findByUsername(username)
    var promises = [
      user.unsubscribeFrom(await this.getPostsTimelineId()),
      dbAdapter.createUserBan(this.id, user.id),
      monitor.increment('users.bans')
    ]
    // reject if and only if there is a pending request
    var requestIds = await this.getSubscriptionRequestIds()
    if (requestIds.indexOf(user.id) >= 0)
      promises.push(this.rejectSubscriptionRequest(user.id))
    await Promise.all(promises)
    return 1
  }

  User.prototype.unban = async function(username) {
    var user = await User.findByUsername(username)
    monitor.increment('users.unbans')
    return dbAdapter.deleteUserBan(this.id, user.id)
  }

  // Subscribe to user-owner of a given `timelineId`
  User.prototype.subscribeTo = async function(timelineId) {
    let timeline = await Timeline.findById(timelineId)
    let user = await FeedFactory.findById(timeline.userId)

    if (user.username == this.username)
      throw new Error("Invalid")

    let currentTime = new Date().getTime()
    let timelineIds = await user.getPublicTimelineIds()

    let promises = _.flatten(timelineIds.map((timelineId) => [
      dbAdapter.createUserSubscription(this.id, currentTime, timelineId),
      dbAdapter.addTimelineSubscriber(timelineId, currentTime, this.id)
    ]))

    promises.push(timeline.mergeTo(await this.getRiverOfNewsTimelineId()))

    promises.push((await Stats.findById(this.id)).addSubscription())
    promises.push((await Stats.findById(user.id)).addSubscriber())

    await Promise.all(promises)

    monitor.increment('users.subscriptions')

    return this
  }

  // Subscribe this user to `username`
  User.prototype.subscribeToUsername = async function(username) {
    var user = await User.findByUsername(username)
    var timelineId = await user.getPostsTimelineId()
    await this.validateCanSubscribe(timelineId)
    return this.subscribeTo(timelineId)
  }

  User.prototype.unsubscribeFrom = async function(timelineId, options = {}) {
    var timeline = await Timeline.findById(timelineId)
    var user = await FeedFactory.findById(timeline.userId)

    // a user cannot unsubscribe from herself
    if (user.username == this.username)
      throw new Error("Invalid")

    let promises = []

    if (_.isUndefined(options.skip)) {
      // remove timelines from user's subscriptions
      let timelineIds = await user.getPublicTimelineIds()

      let unsubPromises = _.flatten(timelineIds.map((timelineId) => [
        dbAdapter.deleteUserSubscription(this.id, timelineId),
        dbAdapter.removeTimelineSubscriber(timelineId, this.id)
      ]))

      promises = promises.concat(unsubPromises)
    }

    // remove all posts of The Timeline from user's River of News
    promises.push(timeline.unmerge(await this.getRiverOfNewsTimelineId()))

    // remove all posts of The Timeline from likes timeline of user
    if (options.likes)
      promises.push(timeline.unmerge(await this.getLikesTimelineId()))

    // remove all post of The Timeline from comments timeline of user
    if (options.comments)
      promises.push(timeline.unmerge(await this.getCommentsTimelineId()))

    // update counters for subscriber and her friend
    promises.push((await Stats.findById(this.id)).removeSubscription())
    promises.push((await Stats.findById(user.id)).removeSubscriber())

    await Promise.all(promises)

    monitor.increment('users.unsubscriptions')

    return this
  }

  User.prototype.getStatistics = function() {
    return Stats.findById(this.id)
  }

  User.prototype.newComment = function(attrs) {
    attrs.userId = this.id
    monitor.increment('users.comments')
    return new Comment(attrs)
  }

  User.prototype.newAttachment = async function(attrs) {
    attrs.userId = this.id
    monitor.increment('users.attachments')
    return new Attachment(attrs)
  }

  User.prototype.updateProfilePicture = async function(file) {
    let image = Promise.promisifyAll(gm(file.path))

    let originalSize

    try {
      originalSize  = await image.sizeAsync()
    } catch (err) {
      throw new BadRequestException("Not an image file")
    }

    this.profilePictureUuid = uuid.v4()

    let sizes = [
      User.PROFILE_PICTURE_SIZE_LARGE,
      User.PROFILE_PICTURE_SIZE_MEDIUM,
      User.PROFILE_PICTURE_SIZE_SMALL
    ]

    let promises = sizes.map(size => this.saveProfilePictureWithSize(file.path, this.profilePictureUuid, originalSize, size))
    await Promise.all(promises)

    this.updatedAt = new Date().getTime()

    let payload = {
      'profilePictureUuid': this.profilePictureUuid,
      'updatedAt': this.updatedAt.toString()
    }

    return dbAdapter.updateUser(this.id, payload)
  }

  User.prototype.saveProfilePictureWithSize = function(path, uuid, originalSize, size) {
    var image = Promise.promisifyAll(gm(path))
    var origWidth = originalSize.width
    var origHeight = originalSize.height
    if (origWidth > origHeight) {
      var dx = origWidth - origHeight
      image = image.crop(origHeight, origHeight, dx / 2, 0)
    } else if (origHeight > origWidth) {
      var dy = origHeight - origWidth
      image = image.crop(origWidth, origWidth, 0, dy / 2)
    }
    image = image.resize(size, size)
    image = image.quality(95)
    var destPath = this.getProfilePicturePath(uuid, size)
    return image.writeAsync(destPath)
  }

  User.prototype.getProfilePicturePath = function(uuid, size) {
    return config.profilePictures.storage.rootDir + config.profilePictures.path + this.getProfilePictureFilename(uuid, size)
  }

  User.prototype.getProfilePictureFilename = function(uuid, size) {
    return uuid + "_" + size + ".jpg"
  }

  User.prototype.getProfilePictureLargeUrl = function() {
    if (_.isEmpty(this.profilePictureUuid)) {
      return Promise.resolve('')
    }
    return Promise.resolve(config.profilePictures.url + config.profilePictures.path + this.getProfilePictureFilename(
        this.profilePictureUuid, User.PROFILE_PICTURE_SIZE_LARGE))
  }

  User.prototype.getProfilePictureMediumUrl = function() {
    if (_.isEmpty(this.profilePictureUuid)) {
      return Promise.resolve('')
    }
    return Promise.resolve(config.profilePictures.url + config.profilePictures.path + this.getProfilePictureFilename(
      this.profilePictureUuid, User.PROFILE_PICTURE_SIZE_MEDIUM))
  }

  /**
   * Checks if the specified user can post to the timeline of this user.
   */
  User.prototype.validateCanPost = async function(postingUser) {
    // NOTE: when user is subscribed to another user she in fact is
    // subscribed to her posts timeline
    const [
      timelineIdA, timelineIdB,
      subscriptionIds, subscriberIds
    ] =
      await Promise.all([
        postingUser.getPostsTimelineId(), this.getPostsTimelineId(),
        postingUser.getSubscriptionIds(), this.getSubscriptionIds()
      ])

    if ((subscriberIds.indexOf(timelineIdA) == -1 || subscriptionIds.indexOf(timelineIdB) == -1)
        && postingUser.username != this.username
    ) {
      throw new ForbiddenException("You can't send private messages to friends that are not mutual")
    }

    return this
  }

  User.prototype.validateCanSubscribe = async function(timelineId) {
    var timelineIds = await this.getSubscriptionIds()
    if (_.includes(timelineIds, timelineId)) {
      throw new ForbiddenException("You are already subscribed to that user")
    }
    var timeline = await Timeline.findById(timelineId)
    var banIds = await this.getBanIds()
    if (banIds.indexOf(timeline.userId) >= 0) {
      throw new ForbiddenException("You cannot subscribe to a banned user")
    }
    var user = await User.findById(timeline.userId)
    var theirBanIds = await user.getBanIds()
    if (theirBanIds.indexOf(this.id) >= 0) {
      throw new ForbiddenException("This user prevented your from subscribing to them")
    }

    if (user.isPrivate === '1')
      throw new ForbiddenException("You cannot subscribe to private feed")

    return timelineId
  }

  User.prototype.validateCanUnsubscribe = async function(timelineId) {
    const timelineIds = await this.getSubscriptionIds()

    if (!_.includes(timelineIds, timelineId)) {
      throw new ForbiddenException("You are not subscribed to that user")
    }
  }

  /* checks if user can like some post */
  User.prototype.validateCanLikePost = function(post) {
    return this.validateCanLikeOrUnlikePost('like', post)
  }

  User.prototype.validateCanUnLikePost = function(post) {
    return this.validateCanLikeOrUnlikePost('unlike', post)
  }

  User.prototype.validateCanComment = async function(postId) {
    const post = await Post.findById(postId)

    if (!post)
      throw new Error("Not found")

    const valid = await post.validateCanShow(this.id)

    if (!valid)
      throw new Error("Not found")

    return true
  }

  User.prototype.validateCanLikeOrUnlikePost = async function(action, post) {
    let userLikedPost = await dbAdapter.hasUserLikedPost(this.id, post.id)

    if (userLikedPost && action == 'like')
      throw new ForbiddenException("You can't like post that you have already liked")

    if (!userLikedPost && action == 'unlike')
      throw new ForbiddenException("You can't un-like post that you haven't yet liked")

    let valid = await post.validateCanShow(this.id)

    if (!valid)
      throw new Error("Not found")

    return this
  }

  User.prototype.updateLastActivityAt = async function() {
    if (!this.isUser()) {
      // update group lastActivity for all subscribers
      var updatedAt = new Date().getTime()
      let payload = {
        'updatedAt': updatedAt.toString()
      }
      return dbAdapter.updateUser(this.id, payload)
    }
  }

  User.prototype.sendSubscriptionRequest = async function(userId) {
    await this.validateCanSendSubscriptionRequest(userId)

    var currentTime = new Date().getTime()
    return await Promise.all([
      dbAdapter.createUserSubscriptionRequest(this.id, currentTime, userId),
      dbAdapter.createUserSubscriptionPendingRequest(this.id, currentTime, userId)
    ])
  }

  User.prototype.acceptSubscriptionRequest = async function(userId) {
    await this.validateCanManageSubscriptionRequests(userId)

    await Promise.all([
      dbAdapter.deleteUserSubscriptionRequest(this.id, userId),
      dbAdapter.deleteUserSubscriptionPendingRequest(this.id, userId)
    ])

    var timelineId = await this.getPostsTimelineId()

    var user = await User.findById(userId)
    return user.subscribeTo(timelineId)
  }

  User.prototype.rejectSubscriptionRequest = async function(userId) {
    await this.validateCanManageSubscriptionRequests(userId)

    return await Promise.all([
      dbAdapter.deleteUserSubscriptionRequest(this.id, userId),
      dbAdapter.deleteUserSubscriptionPendingRequest(this.id, userId)
    ])
  }

  User.prototype.getPendingSubscriptionRequestIds = async function() {
    this.pendingSubscriptionRequestIds = await dbAdapter.getUserSubscriptionPendingRequestsIds(this.id)
    return this.pendingSubscriptionRequestIds
  }

  User.prototype.getPendingSubscriptionRequests = async function() {
    var pendingSubscriptionRequestIds = await this.getPendingSubscriptionRequestIds()
    return await User.findByIds(pendingSubscriptionRequestIds)
  }

  User.prototype.getSubscriptionRequestIds = async function() {
    return await dbAdapter.getUserSubscriptionRequestsIds(this.id)
  }

  User.prototype.getSubscriptionRequests = async function() {
    var subscriptionRequestIds = await this.getSubscriptionRequestIds()
    return await User.findByIds(subscriptionRequestIds)
  }

  User.prototype.validateCanSendSubscriptionRequest = async function(userId) {
    var exists = await dbAdapter.isSubscriptionRequestPresent(this.id, userId)
    var user = await User.findById(userId)
    var banIds = await user.getBanIds()

    // user can send subscription request if and only if subscription
    // is a private and this is first time user is subscribing to it
    if (!exists && user.isPrivate === '1' &&
       banIds.indexOf(this.id) === -1)
      return true

    throw new Error("Invalid")
  }

  User.prototype.validateCanManageSubscriptionRequests = async function(userId) {
    var exists = await dbAdapter.isSubscriptionRequestPresent(userId, this.id)

    if (!exists)
      throw new Error("Invalid")

    return true
  }

  User.prototype.validateCanBeAccessedByUser = async function(otherUser) {
    if (this.isPrivate !== '1') {
      return true
    }

    if (!otherUser) {
      // no anonymous users allowed
      return false
    }

    let subscriberIds = await this.getSubscriberIds()

    if (otherUser.id !== this.id && subscriberIds.indexOf(otherUser.id) == -1) {
      // not an owner and not a subscriber
      return false
    }

    return true
  }

  return User
}

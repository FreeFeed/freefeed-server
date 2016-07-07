import crypto from 'crypto'

import bcrypt from 'bcrypt'
import { promisify, promisifyAll } from 'bluebird'
import aws from 'aws-sdk'
import fs from 'fs'
import gm from 'gm'
import GraphemeBreaker from 'grapheme-breaker'
import _ from 'lodash'
import monitor from 'monitor-dog'
import validator from 'validator'
import uuid from 'uuid'

import { load as configLoader } from "../../config/config"
import { BadRequestException, ForbiddenException, NotFoundException, ValidationException } from '../support/exceptions'
import { Attachment, Comment, Post } from '../models'


promisifyAll(bcrypt)
promisifyAll(crypto)
promisifyAll(gm)

const config = configLoader()

exports.addModel = function (dbAdapter) {
  /**
   * @constructor
   */
  const User = function (params) {
    let password = null

    this.id = params.id
    this.username = params.username
    this.screenName = params.screenName
    this.email = params.email
    this.description = params.description || ''
    this.frontendPreferences = params.frontendPreferences || {}

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
    this.subscribedFeedIds = params.subscribedFeedIds || []

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

  User.className = User
  User.namespace = "user"

  User.PROFILE_PICTURE_SIZE_LARGE = 75
  User.PROFILE_PICTURE_SIZE_MEDIUM = 50

  Object.defineProperty(User.prototype, 'username', {
    get: function () { return this.username_ },
    set: function (newValue) {
      if (newValue)
        this.username_ = newValue.trim().toLowerCase()
    }
  })

  Object.defineProperty(User.prototype, 'screenName', {
    get: function () { return this.screenName_ },
    set: function (newValue) {
      if (_.isString(newValue))
        this.screenName_ = newValue.trim()
    }
  })

  Object.defineProperty(User.prototype, 'email', {
    get: function () { return _.isUndefined(this.email_) ? "" : this.email_ },
    set: function (newValue) {
      if (_.isString(newValue))
        this.email_ = newValue.trim()
    }
  })

  Object.defineProperty(User.prototype, 'isPrivate', {
    get: function () { return this.isPrivate_ },
    set: function (newValue) {
      this.isPrivate_ = newValue || '0'
    }
  })

  Object.defineProperty(User.prototype, 'description', {
    get: function () { return this.description_ },
    set: function (newValue) {
      if (_.isString(newValue))
        this.description_ = newValue.trim()
    }
  })

  Object.defineProperty(User.prototype, 'frontendPreferences', {
    get: function () { return this.frontendPreferences_ },
    set: function (newValue) {
      if (_.isString(newValue)) {
        newValue = JSON.parse(newValue)
      }

      this.frontendPreferences_ = newValue
    }
  })

  User.stopList = (skipExtraList) => {
    if (skipExtraList) {
      return config.application.USERNAME_STOP_LIST
    }

    return config.application.USERNAME_STOP_LIST.concat(config.application.EXTRA_STOP_LIST)
  }

  User.getObjectsByIds = (objectIds) => {
    return dbAdapter.getFeedOwnersByIds(objectIds)
  }

  User.prototype.isUser = function () {
    return this.type === "user"
  }

  User.prototype.newPost = async function(attrs) {
    attrs.userId = this.id
    if (!attrs.timelineIds || !attrs.timelineIds[0]) {
      const timelineId = await this.getPostsTimelineId()
      attrs.timelineIds = [timelineId]
    }
    return new Post(attrs)
  }

  User.prototype.updateResetPasswordToken = async function() {
    const now = new Date().getTime()
    const token = await this.generateResetPasswordToken()

    const payload = {
      'resetPasswordToken':  token,
      'resetPasswordSentAt': now
    }

    await dbAdapter.updateUser(this.id, payload)

    this.resetPasswordToken = token
    return this.resetPasswordToken
  }

  User.prototype.generateResetPasswordToken = async function() {
    const buf = await crypto.randomBytesAsync(48)
    return buf.toString('hex')
  }

  User.prototype.validPassword = function (clearPassword) {
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

    const exists = await dbAdapter.existsUserEmail(email)

    if (exists) {
      // email is taken
      return false
    }

    return true
  }

  User.prototype.isValidUsername = function (skip_stoplist) {
    const valid = this.username
        && this.username.length >= 3   // per the spec
        && this.username.length <= 25  // per the spec
        && this.username.match(/^[A-Za-z0-9]+$/)
        && User.stopList(skip_stoplist).indexOf(this.username) == -1

    return valid
  }

  User.prototype.isValidScreenName = function () {
    return this.screenNameIsValid(this.screenName)
  }

  User.prototype.screenNameIsValid = function (screenName) {
    if (!screenName) {
      return false
    }

    const len = GraphemeBreaker.countBreaks(screenName)

    if (len < 3 || len > 25) {
      return false
    }

    return true
  }

  User.prototype.isValidDescription = function () {
    return User.descriptionIsValid(this.description)
  }

  User.descriptionIsValid = function (description) {
    const len = GraphemeBreaker.countBreaks(description)
    return (len <= 1500)
  }

  User.frontendPreferencesIsValid = function (frontendPreferences) {
    // Check size
    const prefString = JSON.stringify(frontendPreferences)
    const len = GraphemeBreaker.countBreaks(prefString)
    if (len > config.frontendPreferencesLimit) {
      return false
    }

    // Check structure
    // (for each key in preferences there must be an object value)
    if (!_.isPlainObject(frontendPreferences)) {
      return false
    }
    for (const prop in frontendPreferences) {
      if (!frontendPreferences[prop] || typeof frontendPreferences[prop] !== 'object') {
        return false
      }
    }

    return true
  }

  User.prototype.validate = async function(skip_stoplist) {
    if (!this.isValidUsername(skip_stoplist)) {
      throw new Error('Invalid username')
    }

    if (!this.isValidScreenName()) {
      throw new Error(`"${this.screenName}" is not a valid display name. Names must be between 3 and 25 characters long.`)
    }

    if (!await this.isValidEmail()) {
      throw new Error('Invalid email')
    }

    if (!this.isValidDescription()) {
      throw new Error('Description is too long')
    }
  }

  User.prototype.validateUsernameUniqueness = async function() {
    const res = await dbAdapter.existsUsername(this.username)

    if (res !== 0)
      throw new Error("Already exists")
  }

  User.prototype.validateOnCreate = async function(skip_stoplist) {
    const promises = [
      this.validate(skip_stoplist),
      this.validateUsernameUniqueness()
    ];

    await Promise.all(promises)
  }

  User.prototype.create = async function(skip_stoplist) {
    this.createdAt = new Date().getTime()
    this.updatedAt = new Date().getTime()
    this.screenName = this.screenName || this.username

    await this.validateOnCreate(skip_stoplist)

    const timer = monitor.timer('users.create-time')
    await this.initPassword()

    const payload = {
      'username':            this.username,
      'screenName':          this.screenName,
      'email':               this.email,
      'type':                this.type,
      'isPrivate':           '0',
      'description':         '',
      'createdAt':           this.createdAt.toString(),
      'updatedAt':           this.updatedAt.toString(),
      'hashedPassword':      this.hashedPassword,
      'frontendPreferences': JSON.stringify({})
    }
    this.id = await dbAdapter.createUser(payload)
    await dbAdapter.createUserTimelines(this.id, ['RiverOfNews', 'Hides', 'Comments', 'Likes', 'Posts', 'Directs', 'MyDiscussions'])
    timer.stop() // @todo finally {}
    monitor.increment('users.creates')

    return this
  }

  User.prototype.update = async function(params) {
    const payload = {}
    const changeableKeys = ['screenName', 'email', 'isPrivate', 'description', 'frontendPreferences']

    if (params.hasOwnProperty('screenName') && params.screenName != this.screenName) {
      if (!this.screenNameIsValid(params.screenName)) {
        throw new Error(`"${params.screenName}" is not a valid display name. Names must be between 3 and 25 characters long.`)
      }

      payload.screenName = params.screenName
    }

    if (params.hasOwnProperty('email') && params.email != this.email) {
      if (!(await User.emailIsValid(params.email))) {
        throw new Error("Invalid email")
      }

      payload.email = params.email
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

      payload.isPrivate = params.isPrivate
    }

    if (params.hasOwnProperty('description') && params.description != this.description) {
      if (!User.descriptionIsValid(params.description)) {
        throw new Error("Description is too long")
      }

      payload.description = params.description
    }

    if (params.hasOwnProperty('frontendPreferences')) {
      // Validate the input object
      if (!User.frontendPreferencesIsValid(params.frontendPreferences)) {
        throw new ValidationException('Invalid frontendPreferences')
      }

      const preferences = this.frontendPreferences

      // Shallow merge objects
      _.assign(preferences, params.frontendPreferences)

      // Validate the merged object
      if (!User.frontendPreferencesIsValid(preferences)) {
        throw new ValidationException('Invalid frontendPreferences')
      }

      payload.frontendPreferences = preferences
    }

    if (_.intersection(_.keys(payload), changeableKeys).length > 0) {
      const preparedPayload = payload
      payload.updatedAt = new Date().getTime()

      preparedPayload.updatedAt = payload.updatedAt.toString()

      if (_.has(payload, 'frontendPreferences')) {
        preparedPayload.frontendPreferences = JSON.stringify(payload.frontendPreferences)
      }

      await dbAdapter.updateUser(this.id, preparedPayload)

      for (const k in payload) {
        this[k] = payload[k]
      }
    }

    return this
  }

  User.prototype.subscribeNonFriends = async function() {
    // NOTE: this method is super ineffective as it iterates all posts
    // and then all comments in user's timeline, we could make it more
    // efficient when introduce Entries table with meta column (post to
    // timelines many-to-many over Entries)
    /* eslint-disable babel/no-await-in-loop */

    const timeline = await this.getPostsTimeline({ currentUser: this.id })
    const posts = await timeline.getPosts(0, -1)

    let fixedUsers = []

    // first of all, let's revive likes
    for (const post of posts) {
      const actions = []

      const [likes, comments] = await Promise.all([post.getLikes(), post.getComments()]);

      for (const usersChunk of _.chunk(likes, 10)) {
        const promises = usersChunk.map(async (user) => {
          return user.getLikesTimelineIntId()
        })
        const likesFeedsIntIds = await Promise.all(promises)
        actions.push(dbAdapter.insertPostIntoFeeds(likesFeedsIntIds, post.id))
      }

      const uniqueCommenterUids = _.uniq(comments.map((comment) => comment.userId))
      const commenters = await dbAdapter.getUsersByIds(uniqueCommenterUids)

      for (const usersChunk of _.chunk(commenters, 10)) {
        const promises = usersChunk.map(async (user) => {
          return user.getCommentsTimelineIntId()
        })

        const commentsFeedsIntIds = await Promise.all(promises)
        actions.push(dbAdapter.insertPostIntoFeeds(commentsFeedsIntIds, post.id))
      }

      await Promise.all(actions)

      fixedUsers = _.uniq(fixedUsers.concat(likes).concat(commenters), 'id')
    }

    for (const usersChunk of _.chunk(fixedUsers, 10)) {
      const promises = usersChunk.map(async (user) => {
        const [riverId, commentsTimeline, likesTimeline] = await Promise.all([
          user.getRiverOfNewsTimelineIntId(),
          user.getCommentsTimeline(),
          user.getLikesTimeline()
        ])

        await commentsTimeline.mergeTo(riverId)
        await likesTimeline.mergeTo(riverId)
      })

      await Promise.all(promises)
    }
    /* eslint-enable babel/no-await-in-loop */
  }

  User.prototype.unsubscribeNonFriends = async function() {
    /* eslint-disable babel/no-await-in-loop */
    const subscriberIds = await this.getSubscriberIds()
    const timeline = await this.getPostsTimeline()

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
    const posts = await timeline.getPosts(0, -1)

    let allUsers = []

    for (const post of posts) {
      const timelines = await post.getTimelines()
      const userPromises = timelines.map((timeline) => timeline.getUser())
      const users = await Promise.all(userPromises)

      allUsers = _.uniq(allUsers.concat(users), 'id')
    }

    // and remove all private posts from all strangers timelines
    const users = _.filter(
      allUsers,
      (user) => (subscriberIds.indexOf(user.id) === -1 && user.id != this.id)
    )

    for (const chunk of _.chunk(users, 10)) {
      const actions = chunk.map((user) => user.unsubscribeFrom(timeline.id, { likes: true, comments: true, skip: true }))
      await Promise.all(actions)
    }
    /* eslint-enable babel/no-await-in-loop */
  }

  User.prototype.updatePassword = async function(password, passwordConfirmation) {
    if (password.length === 0) {
      throw new Error('Password cannot be blank')
    } else if (password !== passwordConfirmation) {
      throw new Error("Passwords do not match")
    }

    try {
      const updatedAt = new Date().getTime()
      const payload = {
        updatedAt:      updatedAt.toString(),
        hashedPassword: await bcrypt.hashAsync(password, 10)
      }

      await dbAdapter.updateUser(this.id, payload)

      this.updatedAt = updatedAt
      this.hashedPassword = payload.hashedPassword
      return this
    } catch (e) {
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
    const myDiscussionsTimelineId = await this.getMyDiscussionsTimelineIntId()

    const feed = await dbAdapter.getTimelineByIntId(myDiscussionsTimelineId, params)
    feed.posts = await feed.getPosts(feed.offset, feed.limit)
    return feed
  }

  User.prototype.getGenericTimelineId = async function(name, params) {
    params = params || {}

    const timeline = await dbAdapter.getUserNamedFeed(this.id, name, params)

    if (!timeline) {
      console.log(`Timeline '${name}' not found for user`, this)         // eslint-disable-line no-console
      return null
    }

    return timeline.id
  }

  User.prototype.getGenericTimelineIntId = async function(name) {
    const timelineIds = await this.getTimelineIds()

    const timeline = await dbAdapter.getTimelineById(timelineIds[name])

    return timeline.intId
  }

  User.prototype.getGenericTimeline = async function(name, params) {
    const timelineId = await this[`get${name}TimelineId`](params)

    const timeline = await dbAdapter.getTimelineById(timelineId, params)
    timeline.posts = await timeline.getPosts(timeline.offset, timeline.limit)

    return timeline
  }

  User.prototype.getMyDiscussionsTimelineIntId = function () {
    return this.getGenericTimelineIntId('MyDiscussions')
  }

  User.prototype.getHidesTimelineId = function (params) {
    return this.getGenericTimelineId('Hides', params)
  }

  User.prototype.getHidesTimelineIntId = function (params) {
    return this.getGenericTimelineIntId('Hides', params)
  }

  User.prototype.getRiverOfNewsTimelineId = function (params) {
    return this.getGenericTimelineId('RiverOfNews', params)
  }

  User.prototype.getRiverOfNewsTimelineIntId = function (params) {
    return this.getGenericTimelineIntId('RiverOfNews', params)
  }

  User.prototype.getRiverOfNewsTimeline = async function(params) {
    const timelineId = await this.getRiverOfNewsTimelineId(params)
    const hidesTimelineIntId = await this.getHidesTimelineIntId(params)

    const riverOfNewsTimeline = await dbAdapter.getTimelineById(timelineId, params)
    const banIds = await this.getBanIds()
    const posts = await riverOfNewsTimeline.getPosts(riverOfNewsTimeline.offset,
                                                   riverOfNewsTimeline.limit)

    riverOfNewsTimeline.posts = await Promise.all(posts.map(async (post) => {
      const postInTimeline = _.includes(post.feedIntIds, hidesTimelineIntId)

      if (postInTimeline) {
        post.isHidden = true
      }

      return banIds.indexOf(post.userId) >= 0 ? null : post
    }))

    return riverOfNewsTimeline
  }

  User.prototype.getLikesTimelineId = function () {
    return this.getGenericTimelineId('Likes')
  }

  User.prototype.getLikesTimelineIntId = function () {
    return this.getGenericTimelineIntId('Likes')
  }

  User.prototype.getLikesTimeline = function (params) {
    return this.getGenericTimeline('Likes', params)
  }

  User.prototype.getPostsTimelineId = function () {
    return this.getGenericTimelineId('Posts')
  }

  User.prototype.getPostsTimelineIntId = function () {
    return this.getGenericTimelineIntId('Posts')
  }

  User.prototype.getPostsTimeline = function (params) {
    return this.getGenericTimeline('Posts', params)
  }

  User.prototype.getCommentsTimelineId = function () {
    return this.getGenericTimelineId('Comments')
  }

  User.prototype.getCommentsTimelineIntId = function () {
    return this.getGenericTimelineIntId('Comments')
  }

  User.prototype.getCommentsTimeline = function (params) {
    return this.getGenericTimeline('Comments', params)
  }

  User.prototype.getDirectsTimelineId = function () {
    return this.getGenericTimelineId('Directs')
  }

  User.prototype.getDirectsTimeline = function (params) {
    return this.getGenericTimeline('Directs', params)
  }

  User.prototype.getTimelineIds = async function() {
    const timelineIds = await dbAdapter.getUserTimelinesIds(this.id)
    return timelineIds || {}
  }

  User.prototype.getTimelines = async function(params) {
    const timelineIds = await this.getTimelineIds()
    const timelines = await dbAdapter.getTimelinesByIds(_.values(timelineIds), params)
    const timelinesOrder = ['RiverOfNews', 'Hides', 'Comments', 'Likes', 'Posts', 'Directs', 'MyDiscussions']
    const sortedTimelines = _.sortBy(timelines, (tl)=>{
      return _.indexOf(timelinesOrder, tl.name)
    })

    return sortedTimelines
  }

  User.prototype.getPublicTimelineIds = function () {
    return Promise.all([
      this.getCommentsTimelineId(),
      this.getLikesTimelineId(),
      this.getPostsTimelineId()
    ])
  }

  User.prototype.getPublicTimelinesIntIds = function () {
    return dbAdapter.getUserNamedFeedsIntIds(this.id, ['Posts', 'Likes', 'Comments'])
  }

  /**
   * @return {Timeline[]}
   */
  User.prototype.getSubscriptions = async function() {
    this.subscriptions = await dbAdapter.getTimelinesByIntIds(this.subscribedFeedIds)
    return this.subscriptions
  }

  User.prototype.getFriendIds = async function() {
    const timelines = await this.getSubscriptions()
    const postTimelines = _.filter(timelines, _.method('isPosts'))

    return postTimelines.map((timeline) => timeline.userId)
  }

  User.prototype.getFriends = async function() {
    const userIds = await this.getFriendIds()
    return await dbAdapter.getUsersByIds(userIds)
  }

  User.prototype.getSubscriberIds = async function() {
    const postsFeedIntId = await this.getPostsTimelineIntId()
    const timeline = await dbAdapter.getTimelineByIntId(postsFeedIntId)
    this.subscriberIds = await timeline.getSubscriberIds()

    return this.subscriberIds
  }

  User.prototype.getSubscribers = async function() {
    const subscriberIds = await this.getSubscriberIds()
    this.subscribers = await dbAdapter.getUsersByIds(subscriberIds)

    return this.subscribers
  }

  User.prototype.getBanIds = function () {
    return dbAdapter.getUserBansIds(this.id)
  }

  User.prototype.ban = async function(username) {
    const user = await dbAdapter.getUserByUsername(username)

    if (null === user) {
      throw new NotFoundException(`User "${username}" is not found`)
    }

    const promises = [
      user.unsubscribeFrom(await this.getPostsTimelineId()),
      dbAdapter.createUserBan(this.id, user.id),
      monitor.increment('users.bans')
    ]
    // reject if and only if there is a pending request
    const requestIds = await this.getSubscriptionRequestIds()
    if (requestIds.indexOf(user.id) >= 0)
      promises.push(this.rejectSubscriptionRequest(user.id))
    await Promise.all(promises)
    return 1
  }

  User.prototype.unban = async function(username) {
    const user = await dbAdapter.getUserByUsername(username)

    if (null === user) {
      throw new NotFoundException(`User "${username}" is not found`)
    }

    monitor.increment('users.unbans')
    return dbAdapter.deleteUserBan(this.id, user.id)
  }

  // Subscribe to user-owner of a given `timelineId`
  User.prototype.subscribeTo = async function(timelineId) {
    const timeline = await dbAdapter.getTimelineById(timelineId)
    const user = await dbAdapter.getFeedOwnerById(timeline.userId)

    if (user.username == this.username)
      throw new Error("Invalid")

    const timelineIds = await user.getPublicTimelineIds()
    const subscribedFeedsIntIds = await dbAdapter.subscribeUserToTimelines(timelineIds, this.id)

    await timeline.mergeTo(await this.getRiverOfNewsTimelineIntId())

    this.subscribedFeedIds = subscribedFeedsIntIds

    await dbAdapter.statsSubscriptionCreated(this.id)
    await dbAdapter.statsSubscriberAdded(user.id)

    monitor.increment('users.subscriptions')

    return this
  }

  // Subscribe this user to `username`
  User.prototype.subscribeToUsername = async function(username) {
    const user = await dbAdapter.getFeedOwnerByUsername(username)

    if (null === user) {
      throw new NotFoundException(`Feed "${username}" is not found`)
    }

    const timelineId = await user.getPostsTimelineId()
    return this.subscribeTo(timelineId)
  }

  User.prototype.unsubscribeFrom = async function(timelineId, options = {}) {
    const timeline = await dbAdapter.getTimelineById(timelineId)
    const user = await dbAdapter.getFeedOwnerById(timeline.userId)
    const wasSubscribed = await dbAdapter.isUserSubscribedToTimeline(this.id, timelineId)

    // a user cannot unsubscribe from herself
    if (user.username == this.username)
      throw new Error("Invalid")

    const promises = []

    if (_.isUndefined(options.skip)) {
      // remove timelines from user's subscriptions
      const timelineIds = await user.getPublicTimelineIds()

      const subscribedFeedsIntIds = await dbAdapter.unsubscribeUserFromTimelines(timelineIds, this.id)
      this.subscribedFeedIds = subscribedFeedsIntIds
    }

    // remove all posts of The Timeline from user's River of News
    promises.push(timeline.unmerge(await this.getRiverOfNewsTimelineIntId()))

    // remove all posts of The Timeline from likes timeline of user
    if (options.likes)
      promises.push(timeline.unmerge(await this.getLikesTimelineIntId()))

    // remove all post of The Timeline from comments timeline of user
    if (options.comments)
      promises.push(timeline.unmerge(await this.getCommentsTimelineIntId()))

    await Promise.all(promises)

    if (wasSubscribed) {
      await dbAdapter.statsSubscriptionDeleted(this.id)
      await dbAdapter.statsSubscriberRemoved(user.id)
    }

    monitor.increment('users.unsubscriptions')

    return this
  }

  User.prototype.calculateStatsValues = async function() {
    let res
    try {
      res = await dbAdapter.getUserStats(this.id)
    } catch (e) {
      res = { posts: 0, likes: 0, comments: 0, subscribers: 0, subscriptions: 0 }
    }

    return res
  }


  User.prototype.getStatistics = async function() {
    if (!this.statsValues) {
      this.statsValues = await this.calculateStatsValues()
    }
    return this.statsValues
  }

  User.prototype.newComment = function (attrs) {
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
    const image = promisifyAll(gm(file.path))

    let originalSize

    try {
      originalSize  = await image.sizeAsync()
    } catch (err) {
      throw new BadRequestException("Not an image file")
    }

    this.profilePictureUuid = uuid.v4()

    const sizes = [
      User.PROFILE_PICTURE_SIZE_LARGE,
      User.PROFILE_PICTURE_SIZE_MEDIUM
    ]

    const promises = sizes.map((size) => this.saveProfilePictureWithSize(file.path, this.profilePictureUuid, originalSize, size))
    await Promise.all(promises)

    this.updatedAt = new Date().getTime()

    const payload = {
      'profilePictureUuid': this.profilePictureUuid,
      'updatedAt':          this.updatedAt.toString()
    }

    return dbAdapter.updateUser(this.id, payload)
  }

  User.prototype.saveProfilePictureWithSize = async function(path, uuid, originalSize, size) {
    const origWidth = originalSize.width
    const origHeight = originalSize.height
    const retinaSize = size * 2

    let image = promisifyAll(gm(path))

    if (origWidth > origHeight) {
      const dx = origWidth - origHeight
      image = image.crop(origHeight, origHeight, dx / 2, 0)
    } else if (origHeight > origWidth) {
      const dy = origHeight - origWidth
      image = image.crop(origWidth, origWidth, 0, dy / 2)
    }

    image = image
      .resize(retinaSize, retinaSize)
      .profile(`${__dirname}/../../lib/assets/sRGB.icm`)
      .autoOrient()
      .quality(95)

    if (config.profilePictures.storage.type === 's3') {
      const tmpPictureFile = `${path}.resized.${size}`
      const destPictureFile = this.getProfilePictureFilename(uuid, size)

      await image.writeAsync(tmpPictureFile)
      await this.uploadToS3(tmpPictureFile, destPictureFile, config.profilePictures)

      return fs.unlinkAsync(tmpPictureFile)
    }

    const destPath = this.getProfilePicturePath(uuid, size)
    return image.writeAsync(destPath)
  }

  // Upload profile picture to the S3 bucket
  User.prototype.uploadToS3 = async function(sourceFile, destFile, subConfig) {
    const s3 = new aws.S3({
      'accessKeyId':     subConfig.storage.accessKeyId || null,
      'secretAccessKey': subConfig.storage.secretAccessKey || null
    })
    const putObject = promisify(s3.putObject, { context: s3 })
    await putObject({
      ACL:                'public-read',
      Bucket:             subConfig.storage.bucket,
      Key:                subConfig.path + destFile,
      Body:               fs.createReadStream(sourceFile),
      ContentType:        'image/jpeg',
      ContentDisposition: 'inline'
    })
  }

  User.prototype.getProfilePicturePath = function (uuid, size) {
    return config.profilePictures.storage.rootDir + config.profilePictures.path + this.getProfilePictureFilename(uuid, size)
  }

  User.prototype.getProfilePictureFilename = function (uuid, size) {
    return `${uuid}_${size}.jpg`
  }

  // used by serializer
  User.prototype.getProfilePictureLargeUrl = async function() {
    if (_.isEmpty(this.profilePictureUuid)) {
      return ''
    }

    return config.profilePictures.url
         + config.profilePictures.path
         + this.getProfilePictureFilename(this.profilePictureUuid, User.PROFILE_PICTURE_SIZE_LARGE)
  }

  // used by serializer
  User.prototype.getProfilePictureMediumUrl = async function() {
    if (_.isEmpty(this.profilePictureUuid)) {
      return ''
    }

    return config.profilePictures.url
         + config.profilePictures.path
         + this.getProfilePictureFilename(this.profilePictureUuid, User.PROFILE_PICTURE_SIZE_MEDIUM)
  }

  /**
   * Checks if the specified user can post to the timeline of this user.
   */
  User.prototype.validateCanPost = async function(postingUser) {
    // NOTE: when user is subscribed to another user she in fact is
    // subscribed to her posts timeline
    const [timelineIdA, timelineIdB] =
      await Promise.all([postingUser.getPostsTimelineId(), this.getPostsTimelineId()])

    const currentUserSubscribedToPostingUser = await dbAdapter.isUserSubscribedToTimeline(this.id, timelineIdA)
    const postingUserSubscribedToCurrentUser = await dbAdapter.isUserSubscribedToTimeline(postingUser.id, timelineIdB)

    if ((!currentUserSubscribedToPostingUser || !postingUserSubscribedToCurrentUser)
        && postingUser.username != this.username
    ) {
      throw new ForbiddenException("You can't send private messages to friends that are not mutual")
    }
  }

  User.prototype.updateLastActivityAt = async function() {
    if (!this.isUser()) {
      // update group lastActivity for all subscribers
      const updatedAt = new Date().getTime()
      const payload = {
        'updatedAt': updatedAt.toString()
      }
      await dbAdapter.updateUser(this.id, payload)
    }
  }

  User.prototype.sendSubscriptionRequest = async function(userId) {
    return await dbAdapter.createSubscriptionRequest(this.id, userId)
  }

  User.prototype.sendPrivateGroupSubscriptionRequest = async function(groupId) {
    return await dbAdapter.createSubscriptionRequest(this.id, groupId)
  }

  User.prototype.acceptSubscriptionRequest = async function(userId) {
    await dbAdapter.deleteSubscriptionRequest(this.id, userId)

    const timelineId = await this.getPostsTimelineId()

    const user = await dbAdapter.getUserById(userId)
    return user.subscribeTo(timelineId)
  }

  User.prototype.rejectSubscriptionRequest = async function(userId) {
    return await dbAdapter.deleteSubscriptionRequest(this.id, userId)
  }

  User.prototype.getPendingSubscriptionRequestIds = async function() {
    this.pendingSubscriptionRequestIds = await dbAdapter.getUserSubscriptionPendingRequestsIds(this.id)
    return this.pendingSubscriptionRequestIds
  }

  User.prototype.getPendingSubscriptionRequests = async function() {
    const pendingSubscriptionRequestIds = await this.getPendingSubscriptionRequestIds()
    return await dbAdapter.getUsersByIds(pendingSubscriptionRequestIds)
  }

  User.prototype.getSubscriptionRequestIds = async function() {
    return await dbAdapter.getUserSubscriptionRequestsIds(this.id)
  }

  User.prototype.getSubscriptionRequests = async function() {
    const subscriptionRequestIds = await this.getSubscriptionRequestIds()
    return await dbAdapter.getUsersByIds(subscriptionRequestIds)
  }

  User.prototype.getFollowedGroups = async function () {
    const timelinesIds = await dbAdapter.getUserSubscriptionsIds(this.id)
    if (timelinesIds.length === 0)
      return []

    const timelines = await dbAdapter.getTimelinesByIds(timelinesIds)
    if (timelines.length === 0)
      return []

    const timelineOwnerIds = _(timelines).map('userId').uniq().value()
    if (timelineOwnerIds.length === 0)
      return []

    const timelineOwners = await dbAdapter.getFeedOwnersByIds(timelineOwnerIds)
    if (timelineOwners.length === 0)
      return []

    const followedGroups = timelineOwners.filter((owner) => {
      return 'group' === owner.type
    })

    return followedGroups
  }

  User.prototype.getManagedGroups = async function () {
    const followedGroups = await this.getFollowedGroups()
    const currentUserId  = this.id

    const promises = followedGroups.map(async (group)=>{
      const adminIds = await group.getAdministratorIds()
      if (adminIds.indexOf(currentUserId) !== -1) {
        return group
      }
      return null
    })

    const managedGroups = await Promise.all(promises)
    return _.compact(managedGroups)
  }

  User.prototype.pendingPrivateGroupSubscriptionRequests = async function () {
    const managedGroups = await this.getManagedGroups()

    const promises = managedGroups.map(async (group)=>{
      const unconfirmedFollowerIds = await group.getSubscriptionRequestIds()
      return unconfirmedFollowerIds.length > 0
    })

    return _.some((await Promise.all(promises)), Boolean)
  }

  User.prototype.getPendingGroupRequests = function () {
    return this.pendingPrivateGroupSubscriptionRequests()
  }

  return User
}

import formidable from 'formidable'
import jwt from 'jsonwebtoken'
import _ from 'lodash'
import monitor from 'monitor-dog'

import { pgAdapter, MyProfileSerializer, SubscriberSerializer, SubscriptionSerializer, User, UserSerializer } from '../../../models'
import exceptions, { NotFoundException, ForbiddenException } from '../../../support/exceptions'
import { load as configLoader } from "../../../../config/config"
import recaptchaVerify from '../../../../lib/recaptcha'


let config = configLoader()

export default class UsersController {
  static async create(req, res) {
    var params = {
      username: req.body.username,
      email: req.body.email
    }

    params.hashedPassword = req.body.password_hash
    if (!config.acceptHashedPasswordsOnly) {
      params.password = req.body.password
    }

    try {
      if (config.recaptcha.enabled) {
        let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress
        await recaptchaVerify(req.body.captcha, ip)
      }

      var user = new User(params)
      await user.create(false)

      try {
        const onboardingUser = await pgAdapter.getFeedOwnerByUsername(config.onboardingUsername)

        if (null === onboardingUser) {
          throw new NotFoundException(`Feed "${config.onboardingUsername}" is not found`)
        }

        await user.subscribeToUsername(config.onboardingUsername)
      } catch (e /*if e instanceof NotFoundException*/) {
        // if onboarding username is not found, just pass
      }

      var secret = config.secret
      var authToken = jwt.sign({ userId: user.id }, secret)

      var json = await new MyProfileSerializer(user).promiseToJSON()
      res.jsonp(_.extend(json, { authToken: authToken }))
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  static async sudoCreate(req, res) {
    var params = {
      username: req.body.username,
      email: req.body.email
    }

    params.hashedPassword = req.body.password_hash
    if (!config.acceptHashedPasswordsOnly) {
      params.password = req.body.password
    }

    try {
      var user = new User(params)
      await user.create(true)

      try {
        const onboardingUser = await pgAdapter.getFeedOwnerByUsername(config.onboardingUsername)

        if (null === onboardingUser) {
          throw new NotFoundException(`Feed "${config.onboardingUsername}" is not found`)
        }

        await user.subscribeToUsername(config.onboardingUsername)
      } catch (e /*if e instanceof NotFoundException*/) {
        // if onboarding username is not found, just pass
      }

      var secret = config.secret
      var authToken = jwt.sign({ userId: user.id }, secret)

      var json = await new MyProfileSerializer(user).promiseToJSON()
      res.jsonp(_.extend(json, { authToken: authToken }))
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  static async sendRequest(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    try {
      const user = await pgAdapter.getFeedOwnerByUsername(req.params.username)

      if (null === user) {
        throw new NotFoundException(`Feed "${req.params.username}" is not found`)
      }

      if (user.isPrivate !== '1') {
        throw new Error("Invalid")
      }

      var hasRequest = await pgAdapter.isSubscriptionRequestPresent(req.user.id, user.id)
      var banIds = await user.getBanIds()

      const valid = !hasRequest && banIds.indexOf(req.user.id) === -1

      if (!valid) {
        throw new Error("Invalid")
      }

      await req.user.sendSubscriptionRequest(user.id)

      res.jsonp({})
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  static async acceptRequest(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    try {
      const user = await pgAdapter.getUserByUsername(req.params.username)

      if (null === user) {
        throw new NotFoundException(`User "${req.params.username}" is not found`)
      }

      const hasRequest = await pgAdapter.isSubscriptionRequestPresent(user.id, req.user.id)
      if (!hasRequest) {
        throw new Error("Invalid")
      }
      await req.user.acceptSubscriptionRequest(user.id)

      res.jsonp({})
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  static async rejectRequest(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    try {
      const user = await pgAdapter.getUserByUsername(req.params.username)

      if (null === user) {
        throw new NotFoundException(`User "${req.params.username}" is not found`)
      }

      const hasRequest = await pgAdapter.isSubscriptionRequestPresent(user.id, req.user.id)
      if (!hasRequest) {
        throw new Error("Invalid")
      }
      await req.user.rejectSubscriptionRequest(user.id)

      res.jsonp({})
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  static async whoami(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    var timer = monitor.timer('users.whoami-time')
    var json = await new MyProfileSerializer(req.user).promiseToJSON()
    res.jsonp(json)
    timer.stop()
  }

  static async show(req, res) {
    try {
      var feed = await pgAdapter.getFeedOwnerByUsername(req.params.username)

      if (null === feed) {
        throw new NotFoundException(`Feed "${req.params.username}" is not found`)
      }

      // HACK: feed.isUser() ? UserSerializer : GroupSerializer
      var serializer = UserSerializer

      var json = await new serializer(feed).promiseToJSON()
      res.jsonp(json)
    } catch (e) {
      exceptions.reportError(res)(e)
    }
  }

  static async subscribers(req, res) {
    var username = req.params.username
      , user

    try {
      user = await pgAdapter.getFeedOwnerByUsername(username)

      if (null === user) {
        throw new NotFoundException(`Feed "${req.params.username}" is not found`)
      }

      if (user.isPrivate === '1') {
        if (!req.user) {
          throw new ForbiddenException('User is private')
        }
        const subscriberIds = await user.getSubscriberIds()
        if (req.user.id !== user.id && subscriberIds.indexOf(req.user.id) == -1) {
          throw new ForbiddenException('User is private')
        }
      }

      var timeline = await user.getPostsTimeline()
      var subscribers = await timeline.getSubscribers()
      var jsonPromises = subscribers.map((subscriber) => new SubscriberSerializer(subscriber).promiseToJSON())

      var json = _.reduce(jsonPromises, async function (memoPromise, jsonPromise) {
        var obj = await jsonPromise
        var memo = await memoPromise

        memo.subscribers.push(obj.subscribers)

        return memo
      }, { subscribers: [] })

      res.jsonp(await json)
    } catch (e) {
      exceptions.reportError(res)(e)
    }
  }

  static async subscriptions(req, res) {
    var username = req.params.username
      , user

    try {
      user = await pgAdapter.getUserByUsername(username)

      if (null === user) {
        throw new NotFoundException(`User "${req.params.username}" is not found`)
      }

      if (user.isPrivate === '1') {
        if (!req.user) {
          throw new ForbiddenException('User is private')
        }

        const subscriberIds = await user.getSubscriberIds()
        if (req.user.id !== user.id && subscriberIds.indexOf(req.user.id) == -1) {
          throw new ForbiddenException('User is private')
        }
      }

      var subscriptions = await user.getSubscriptions()
      var jsonPromises = subscriptions.map((subscription) => new SubscriptionSerializer(subscription).promiseToJSON())

      var reducedJsonPromise = _.reduce(jsonPromises, async function(memoPromise, jsonPromise) {
        var obj = await jsonPromise
        var memo = await memoPromise

        var user = obj.subscribers[0]

        memo.subscriptions.push(obj.subscriptions)
        memo.subscribers[user.id] = user

        return memo
      }, { subscriptions: [], subscribers: {} })

      var json = await reducedJsonPromise
      json.subscribers = _.values(json.subscribers)

      res.jsonp(json)
    } catch (e) {
      exceptions.reportError(res)(e)
    }
  }

  static async ban(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    try {
      var status = await req.user.ban(req.params.username)
      res.jsonp({ status: status })
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  static async unban(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    try {
      var status = await req.user.unban(req.params.username)
      res.jsonp({ status: status })
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  static async subscribe(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    try {
      const username = req.params.username
      const user = await pgAdapter.getFeedOwnerByUsername(username)

      if (null === user) {
        throw new NotFoundException(`Feed "${username}" is not found`)
      }

      if (user.isPrivate === '1') {
        throw new ForbiddenException("You cannot subscribe to private feed")
      }

      const timelineId = await user.getPostsTimelineId()
      const isSubscribed = await pgAdapter.isUserSubscribedToTimeline(req.user.id, timelineId)
      if (isSubscribed) {
        throw new ForbiddenException("You are already subscribed to that user")
      }

      const banIds = await req.user.getBanIds()
      if (banIds.indexOf(user.id) >= 0) {
        throw new ForbiddenException("You cannot subscribe to a banned user")
      }

      const theirBanIds = await user.getBanIds()
      if (theirBanIds.indexOf(req.user.id) >= 0) {
        throw new ForbiddenException("This user prevented your from subscribing to them")
      }

      await req.user.subscribeToUsername(username)

      var json = await new MyProfileSerializer(req.user).promiseToJSON()
      res.jsonp(json)
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  static async unsubscribeUser(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    try {
      var user = await pgAdapter.getUserByUsername(req.params.username)

      if (null === user) {
        throw new NotFoundException(`User "${req.params.username}" is not found`)
      }

      var timelineId = await req.user.getPostsTimelineId()

      const isSubscribed = await pgAdapter.isUserSubscribedToTimeline(user.id, timelineId)
      if (!isSubscribed) {
        throw new ForbiddenException("You are not subscribed to that user")
      }

      await user.unsubscribeFrom(timelineId)

      var json = await new MyProfileSerializer(req.user).promiseToJSON()
      res.jsonp(json)
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  static async unsubscribe(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    var timer = monitor.timer('users.unsubscribe-time')

    try {
      var user = await pgAdapter.getFeedOwnerByUsername(req.params.username)

      if (null === user) {
        throw new NotFoundException(`Feed "${req.params.username}" is not found`)
      }

      var timelineId = await user.getPostsTimelineId()

      const isSubscribed = await pgAdapter.isUserSubscribedToTimeline(req.user.id, timelineId)
      if (!isSubscribed) {
        throw new ForbiddenException("You are not subscribed to that user")
      }

      if ('group' === user.type) {
        const adminIds = await user.getAdministratorIds()

        if (_.includes(adminIds, req.user.id)) {
          throw new ForbiddenException("Group administrators cannot unsubscribe from own groups")
        }
      }
      await req.user.unsubscribeFrom(timelineId)

      var json = await new MyProfileSerializer(req.user).promiseToJSON()
      res.jsonp(json)
    } catch(e) {
      exceptions.reportError(res)(e)
    } finally {
      timer.stop()
    }
 }

  static async update(req, res) {
    if (!req.user || req.user.id != req.params.userId) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    var attrs = _.reduce(['screenName', 'email', 'isPrivate', 'description', 'frontendPreferences'], function(acc, key) {
      if (key in req.body.user)
        acc[key] = req.body.user[key]
      return acc
    }, {})

    try {
      var user = await req.user.update(attrs)
      var json = await new MyProfileSerializer(user).promiseToJSON()
      res.jsonp(json)
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  static async updatePassword(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    var currentPassword = req.body.currentPassword || ''
    try {
      var valid = await req.user.validPassword(currentPassword)
      if (!valid)
        throw new Error('Your old password is not valid')
      await req.user.updatePassword(req.body.password, req.body.passwordConfirmation)

      res.jsonp({ message: 'Your password has been changed' })
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  static async updateProfilePicture(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    var form = new formidable.IncomingForm()

    form.on('file', async function(inputName, file) {
      try {
        await req.user.updateProfilePicture(file)
        res.jsonp({ message: 'Your profile picture has been updated' })
      } catch (e) {
        exceptions.reportError(res)(e)
      }
    })

    form.parse(req)
  }
}

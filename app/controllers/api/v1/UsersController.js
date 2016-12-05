import formidable from 'formidable'
import jwt from 'jsonwebtoken'
import _ from 'lodash'
import monitor from 'monitor-dog'

import { dbAdapter, MyProfileSerializer, SubscriberSerializer, SubscriptionSerializer, User, UserSerializer } from '../../../models'
import { reportError, NotFoundException, ForbiddenException } from '../../../support/exceptions'
import { load as configLoader } from '../../../../config/config'
import recaptchaVerify from '../../../../lib/recaptcha'


const config = configLoader()

export default class UsersController {
  static async create(req, res) {
    const params = {
      username: req.body.username,
      email:    req.body.email
    }

    params.hashedPassword = req.body.password_hash
    if (!config.acceptHashedPasswordsOnly) {
      params.password = req.body.password
    }

    try {
      if (config.recaptcha.enabled) {
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress
        await recaptchaVerify(req.body.captcha, ip)
      }

      const user = new User(params)
      await user.create(false)

      try {
        const onboardingUser = await dbAdapter.getFeedOwnerByUsername(config.onboardingUsername)

        if (null === onboardingUser) {
          throw new NotFoundException(`Feed "${config.onboardingUsername}" is not found`)
        }

        await user.subscribeToUsername(config.onboardingUsername)
      } catch (e /* if e instanceof NotFoundException */) {
        // if onboarding username is not found, just pass
      }

      const secret = config.secret
      const authToken = jwt.sign({ userId: user.id }, secret)

      const json = await new MyProfileSerializer(user).promiseToJSON()
      res.jsonp({ ...json, authToken });
    } catch (e) {
      reportError(res)(e)
    }
  }

  static async sudoCreate(req, res) {
    const params = {
      username: req.body.username,
      email:    req.body.email
    }

    params.hashedPassword = req.body.password_hash
    if (!config.acceptHashedPasswordsOnly) {
      params.password = req.body.password
    }

    try {
      const user = new User(params)
      await user.create(true)

      try {
        const onboardingUser = await dbAdapter.getFeedOwnerByUsername(config.onboardingUsername)

        if (null === onboardingUser) {
          throw new NotFoundException(`Feed "${config.onboardingUsername}" is not found`)
        }

        await user.subscribeToUsername(config.onboardingUsername)
      } catch (e /* if e instanceof NotFoundException */) {
        // if onboarding username is not found, just pass
      }

      const secret = config.secret
      const authToken = jwt.sign({ userId: user.id }, secret)

      const json = await new MyProfileSerializer(user).promiseToJSON()
      res.jsonp({ ...json, authToken });
    } catch (e) {
      reportError(res)(e)
    }
  }

  static async sendRequest(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    try {
      const user = await dbAdapter.getFeedOwnerByUsername(req.params.username)

      if (null === user) {
        throw new NotFoundException(`Feed "${req.params.username}" is not found`)
      }

      if (user.isPrivate !== '1') {
        throw new Error('Invalid')
      }

      const hasRequest = await dbAdapter.isSubscriptionRequestPresent(req.user.id, user.id)
      const banIds = await user.getBanIds()

      const valid = !hasRequest && !banIds.includes(req.user.id)

      if (!valid) {
        throw new Error('Invalid')
      }

      await req.user.sendSubscriptionRequest(user.id)

      res.jsonp({})
    } catch (e) {
      reportError(res)(e)
    }
  }

  static async acceptRequest(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    try {
      const user = await dbAdapter.getUserByUsername(req.params.username)

      if (null === user) {
        throw new NotFoundException(`User "${req.params.username}" is not found`)
      }

      const hasRequest = await dbAdapter.isSubscriptionRequestPresent(user.id, req.user.id)
      if (!hasRequest) {
        throw new Error('Invalid')
      }
      await req.user.acceptSubscriptionRequest(user.id)

      res.jsonp({})
    } catch (e) {
      reportError(res)(e)
    }
  }

  static async rejectRequest(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    try {
      const user = await dbAdapter.getUserByUsername(req.params.username)

      if (null === user) {
        throw new NotFoundException(`User "${req.params.username}" is not found`)
      }

      const hasRequest = await dbAdapter.isSubscriptionRequestPresent(user.id, req.user.id)
      if (!hasRequest) {
        throw new Error('Invalid')
      }
      await req.user.rejectSubscriptionRequest(user.id)

      res.jsonp({})
    } catch (e) {
      reportError(res)(e)
    }
  }

  static async whoami(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    const timer = monitor.timer('users.whoami-time')
    const json = await new MyProfileSerializer(req.user).promiseToJSON()
    res.jsonp(json)
    timer.stop()
  }

  static async show(req, res) {
    try {
      const feed = await dbAdapter.getFeedOwnerByUsername(req.params.username)

      if (null === feed) {
        throw new NotFoundException(`Feed "${req.params.username}" is not found`)
      }

      // cleaned accounts have password-hash set to empty string
      if (feed.hashedPassword === '') {
        throw new NotFoundException(`Feed "${req.params.username}" is not found`)
      }

      // HACK: feed.isUser() ? UserSerializer : GroupSerializer
      const serializer = UserSerializer

      const json = await new serializer(feed).promiseToJSON()
      res.jsonp(json)
    } catch (e) {
      reportError(res)(e)
    }
  }

  static async subscribers(req, res) {
    try {
      const username = req.params.username
      const user = await dbAdapter.getFeedOwnerByUsername(username)

      if (null === user) {
        throw new NotFoundException(`Feed "${req.params.username}" is not found`)
      }

      if (user.isPrivate === '1') {
        if (!req.user) {
          throw new ForbiddenException('User is private')
        }
        const subscriberIds = await user.getSubscriberIds()
        if (req.user.id !== user.id && !subscriberIds.includes(req.user.id)) {
          throw new ForbiddenException('User is private')
        }
      }

      const timeline = await user.getPostsTimeline()
      const subscribers = await timeline.getSubscribers()
      const jsonPromises = subscribers.map((subscriber) => new SubscriberSerializer(subscriber).promiseToJSON())

      const json = _.reduce(jsonPromises, async (memoPromise, jsonPromise) => {
        const obj = await jsonPromise
        const memo = await memoPromise

        memo.subscribers.push(obj.subscribers)

        return memo
      }, { subscribers: [] })

      res.jsonp(await json)
    } catch (e) {
      reportError(res)(e)
    }
  }

  static async subscriptions(req, res) {
    try {
      const username = req.params.username
      const user = await dbAdapter.getUserByUsername(username)

      if (null === user) {
        throw new NotFoundException(`User "${req.params.username}" is not found`)
      }

      if (user.isPrivate === '1') {
        if (!req.user) {
          throw new ForbiddenException('User is private')
        }

        const subscriberIds = await user.getSubscriberIds()
        if (req.user.id !== user.id && !subscriberIds.includes(req.user.id)) {
          throw new ForbiddenException('User is private')
        }
      }

      const subscriptions = await user.getSubscriptions()
      const jsonPromises = subscriptions.map((subscription) => new SubscriptionSerializer(subscription).promiseToJSON())

      const reducedJsonPromise = _.reduce(jsonPromises, async (memoPromise, jsonPromise) => {
        const obj = await jsonPromise
        const memo = await memoPromise

        const user = obj.subscribers[0]

        memo.subscriptions.push(obj.subscriptions)
        memo.subscribers[user.id] = user

        return memo
      }, { subscriptions: [], subscribers: {} })

      const json = await reducedJsonPromise
      json.subscribers = _.values(json.subscribers)

      res.jsonp(json)
    } catch (e) {
      reportError(res)(e)
    }
  }

  static async ban(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    try {
      const status = await req.user.ban(req.params.username)
      res.jsonp({ status })
    } catch (e) {
      if (e.code === '23505') {
        // '23505' stands for unique_violation
        // see https://www.postgresql.org/docs/current/static/errcodes-appendix.html
        reportError(res)(new ForbiddenException("You can't ban user, who's already banned"))
      } else {
        reportError(res)(e)
      }
    }
  }

  static async unban(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    try {
      const status = await req.user.unban(req.params.username)
      res.jsonp({ status })
    } catch (e) {
      reportError(res)(e)
    }
  }

  static async subscribe(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    try {
      const username = req.params.username
      const user = await dbAdapter.getFeedOwnerByUsername(username)

      if (null === user) {
        throw new NotFoundException(`Feed "${username}" is not found`)
      }

      if (user.isPrivate === '1') {
        throw new ForbiddenException('You cannot subscribe to private feed')
      }

      const timelineId = await user.getPostsTimelineId()
      const isSubscribed = await dbAdapter.isUserSubscribedToTimeline(req.user.id, timelineId)
      if (isSubscribed) {
        throw new ForbiddenException('You are already subscribed to that user')
      }

      const banIds = await req.user.getBanIds()
      if (banIds.includes(user.id)) {
        throw new ForbiddenException('You cannot subscribe to a banned user')
      }

      const theirBanIds = await user.getBanIds()
      if (theirBanIds.includes(req.user.id)) {
        throw new ForbiddenException('This user prevented your from subscribing to them')
      }

      await req.user.subscribeToUsername(username)

      const json = await new MyProfileSerializer(req.user).promiseToJSON()
      res.jsonp(json)
    } catch (e) {
      reportError(res)(e)
    }
  }

  static async unsubscribeUser(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    try {
      const user = await dbAdapter.getUserByUsername(req.params.username)

      if (null === user) {
        throw new NotFoundException(`User "${req.params.username}" is not found`)
      }

      const timelineId = await req.user.getPostsTimelineId()

      const isSubscribed = await dbAdapter.isUserSubscribedToTimeline(user.id, timelineId)
      if (!isSubscribed) {
        throw new ForbiddenException('You are not subscribed to that user')
      }

      await user.unsubscribeFrom(timelineId)

      const json = await new MyProfileSerializer(req.user).promiseToJSON()
      res.jsonp(json)
    } catch (e) {
      reportError(res)(e)
    }
  }

  static async unsubscribe(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    const timer = monitor.timer('users.unsubscribe-time')

    try {
      const user = await dbAdapter.getFeedOwnerByUsername(req.params.username)

      if (null === user) {
        throw new NotFoundException(`Feed "${req.params.username}" is not found`)
      }

      const timelineId = await user.getPostsTimelineId()

      const isSubscribed = await dbAdapter.isUserSubscribedToTimeline(req.user.id, timelineId)
      if (!isSubscribed) {
        throw new ForbiddenException('You are not subscribed to that user')
      }

      if ('group' === user.type) {
        const adminIds = await user.getAdministratorIds()

        if (adminIds.includes(req.user.id)) {
          throw new ForbiddenException('Group administrators cannot unsubscribe from own groups')
        }
      }
      await req.user.unsubscribeFrom(timelineId)

      const json = await new MyProfileSerializer(req.user).promiseToJSON()
      res.jsonp(json)
    } catch (e) {
      reportError(res)(e)
    } finally {
      timer.stop()
    }
  }

  static async update(req, res) {
    if (!req.user || req.user.id != req.params.userId) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    const attrs = _.reduce(
      ['screenName', 'email', 'isPrivate', 'isProtected', 'isVisibleToAnonymous', 'description', 'frontendPreferences'],
      (acc, key) => {
        if (key in req.body.user)
          acc[key] = req.body.user[key]
        return acc
      },
      {}
    )

    try {
      const user = await req.user.update(attrs)
      const json = await new MyProfileSerializer(user).promiseToJSON()
      res.jsonp(json)
    } catch (e) {
      reportError(res)(e)
    }
  }

  static async updatePassword(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    const currentPassword = req.body.currentPassword || ''
    try {
      const valid = await req.user.validPassword(currentPassword)
      if (!valid)
        throw new Error('Your old password is not valid')
      await req.user.updatePassword(req.body.password, req.body.passwordConfirmation)

      res.jsonp({ message: 'Your password has been changed' })
    } catch (e) {
      reportError(res)(e)
    }
  }

  static async updateProfilePicture(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    const form = new formidable.IncomingForm()

    form.on('file', async (inputName, file) => {
      try {
        await req.user.updateProfilePicture(file)
        res.jsonp({ message: 'Your profile picture has been updated' })
      } catch (e) {
        reportError(res)(e)
      }
    })

    form.parse(req)
  }
}

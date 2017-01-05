import jwt from 'jsonwebtoken'
import _ from 'lodash'
import monitor from 'monitor-dog'

import { dbAdapter, MyProfileSerializer, SubscriberSerializer, SubscriptionSerializer, User, UserSerializer } from '../../../models'
import { NotFoundException, ForbiddenException } from '../../../support/exceptions'
import { load as configLoader } from '../../../../config/config'
import recaptchaVerify from '../../../../lib/recaptcha'


const config = configLoader()

export default class UsersController {
  static async create(ctx) {
    const params = {
      username: ctx.request.body.username,
      email:    ctx.request.body.email
    }

    params.hashedPassword = ctx.request.body.password_hash
    if (!config.acceptHashedPasswordsOnly) {
      params.password = ctx.request.body.password
    }

    if (config.recaptcha.enabled) {
      const ip = ctx.request.get('x-forwarded-for') || ctx.request.ip;
      await recaptchaVerify(ctx.request.body.captcha, ip);
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
    ctx.body = { ...json, authToken };
  }

  static async sudoCreate(ctx) {
    const params = {
      username: ctx.request.body.username,
      email:    ctx.request.body.email
    }

    params.hashedPassword = ctx.request.body.password_hash
    if (!config.acceptHashedPasswordsOnly) {
      params.password = ctx.request.body.password
    }

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
    ctx.body = { ...json, authToken };
  }

  static async sendRequest(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Not found' };
      return
    }

    const user = await dbAdapter.getFeedOwnerByUsername(ctx.params.username)

    if (null === user) {
      throw new NotFoundException(`Feed "${ctx.params.username}" is not found`)
    }

    if (user.isPrivate !== '1') {
      throw new Error('Invalid')
    }

    const hasRequest = await dbAdapter.isSubscriptionRequestPresent(ctx.state.user.id, user.id)
    const banIds = await user.getBanIds()

    const valid = !hasRequest && !banIds.includes(ctx.state.user.id)

    if (!valid) {
      throw new Error('Invalid')
    }

    await ctx.state.user.sendSubscriptionRequest(user.id)

    ctx.body = {};
  }

  static async acceptRequest(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Not found' };
      return
    }

    const user = await dbAdapter.getUserByUsername(ctx.params.username)

    if (null === user) {
      throw new NotFoundException(`User "${ctx.params.username}" is not found`)
    }

    const hasRequest = await dbAdapter.isSubscriptionRequestPresent(user.id, ctx.state.user.id)
    if (!hasRequest) {
      throw new Error('Invalid')
    }
    await ctx.state.user.acceptSubscriptionRequest(user.id)

    ctx.body = {};
  }

  static async rejectRequest(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Not found' };
      return
    }

    const user = await dbAdapter.getUserByUsername(ctx.params.username)

    if (null === user) {
      throw new NotFoundException(`User "${ctx.params.username}" is not found`)
    }

    const hasRequest = await dbAdapter.isSubscriptionRequestPresent(user.id, ctx.state.user.id)
    if (!hasRequest) {
      throw new Error('Invalid')
    }
    await ctx.state.user.rejectSubscriptionRequest(user.id)

    ctx.body = {};
  }

  static async whoami(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Not found' };
      return
    }

    const timer = monitor.timer('users.whoami-time')
    const json = await new MyProfileSerializer(ctx.state.user).promiseToJSON()
    ctx.body = json
    timer.stop()
  }

  static async show(ctx) {
    const feed = await dbAdapter.getFeedOwnerByUsername(ctx.params.username)

    if (null === feed) {
      throw new NotFoundException(`Feed "${ctx.params.username}" is not found`)
    }

    // cleaned accounts have password-hash set to empty string
    if (feed.hashedPassword === '') {
      throw new NotFoundException(`Feed "${ctx.params.username}" is not found`)
    }

    // HACK: feed.isUser() ? UserSerializer : GroupSerializer
    const serializer = UserSerializer

    const json = await new serializer(feed).promiseToJSON()
    ctx.body = json
  }

  static async subscribers(ctx) {
    const username = ctx.params.username
    const user = await dbAdapter.getFeedOwnerByUsername(username)

    if (null === user) {
      throw new NotFoundException(`Feed "${ctx.params.username}" is not found`)
    }

    if (!ctx.state.user && user.isProtected === '1') {
      throw new ForbiddenException('User is protected')
    }

    if (user.isPrivate === '1') {
      const subscriberIds = await user.getSubscriberIds()
      if (ctx.state.user.id !== user.id && !subscriberIds.includes(ctx.state.user.id)) {
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

    ctx.body = await json;
  }

  static async subscriptions(ctx) {
    const username = ctx.params.username
    const user = await dbAdapter.getUserByUsername(username)

    if (null === user) {
      throw new NotFoundException(`User "${ctx.params.username}" is not found`)
    }

    if (!ctx.state.user && user.isProtected === '1') {
      throw new ForbiddenException('User is protected')
    }

    if (user.isPrivate === '1') {
      const subscriberIds = await user.getSubscriberIds()
      if (ctx.state.user.id !== user.id && !subscriberIds.includes(ctx.state.user.id)) {
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

    ctx.body = json
  }

  static async ban(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Not found' };
      return
    }

    try {
      const status = await ctx.state.user.ban(ctx.params.username)
      ctx.body = { status };
    } catch (e) {
      if (e.code === '23505') {
        // '23505' stands for unique_violation
        // see https://www.postgresql.org/docs/current/static/errcodes-appendix.html
        throw new ForbiddenException("You can't ban user, who's already banned");
      }

      throw e;
    }
  }

  static async unban(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Not found' };
      return
    }

    const status = await ctx.state.user.unban(ctx.params.username)
    ctx.body = { status };
  }

  static async subscribe(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Not found' };
      return
    }

    const username = ctx.params.username
    const user = await dbAdapter.getFeedOwnerByUsername(username)

    if (null === user) {
      throw new NotFoundException(`Feed "${username}" is not found`)
    }

    if (user.isPrivate === '1') {
      throw new ForbiddenException('You cannot subscribe to private feed')
    }

    const timelineId = await user.getPostsTimelineId()
    const isSubscribed = await dbAdapter.isUserSubscribedToTimeline(ctx.state.user.id, timelineId)
    if (isSubscribed) {
      throw new ForbiddenException('You are already subscribed to that user')
    }

    const banIds = await ctx.state.user.getBanIds()
    if (banIds.includes(user.id)) {
      throw new ForbiddenException('You cannot subscribe to a banned user')
    }

    const theirBanIds = await user.getBanIds()
    if (theirBanIds.includes(ctx.state.user.id)) {
      throw new ForbiddenException('This user prevented your from subscribing to them')
    }

    await ctx.state.user.subscribeToUsername(username)

    const json = await new MyProfileSerializer(ctx.state.user).promiseToJSON()
    ctx.body = json
  }

  static async unsubscribeUser(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Not found' };
      return
    }

    const user = await dbAdapter.getUserByUsername(ctx.params.username)

    if (null === user) {
      throw new NotFoundException(`User "${ctx.params.username}" is not found`)
    }

    const timelineId = await ctx.state.user.getPostsTimelineId()

    const isSubscribed = await dbAdapter.isUserSubscribedToTimeline(user.id, timelineId)
    if (!isSubscribed) {
      throw new ForbiddenException('You are not subscribed to that user')
    }

    await user.unsubscribeFrom(timelineId)

    const json = await new MyProfileSerializer(ctx.state.user).promiseToJSON()
    ctx.body = json
  }

  static async unsubscribe(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Not found' };
      return
    }

    const timer = monitor.timer('users.unsubscribe-time')

    try {
      const user = await dbAdapter.getFeedOwnerByUsername(ctx.params.username)

      if (null === user) {
        throw new NotFoundException(`Feed "${ctx.params.username}" is not found`)
      }

      const timelineId = await user.getPostsTimelineId()

      const isSubscribed = await dbAdapter.isUserSubscribedToTimeline(ctx.state.user.id, timelineId)
      if (!isSubscribed) {
        throw new ForbiddenException('You are not subscribed to that user')
      }

      if ('group' === user.type) {
        const adminIds = await user.getAdministratorIds()

        if (adminIds.includes(ctx.state.user.id)) {
          throw new ForbiddenException('Group administrators cannot unsubscribe from own groups')
        }
      }
      await ctx.state.user.unsubscribeFrom(timelineId)

      const json = await new MyProfileSerializer(ctx.state.user).promiseToJSON()
      ctx.body = json
    } finally {
      timer.stop()
    }
  }

  static async update(ctx) {
    if (!ctx.state.user || ctx.state.user.id != ctx.params.userId) {
      ctx.status = 401;
      ctx.body = { err: 'Not found' };
      return
    }

    const attrs = _.reduce(
      ['screenName', 'email', 'isPrivate', 'isProtected', 'isVisibleToAnonymous', 'description', 'frontendPreferences'],
      (acc, key) => {
        if (key in ctx.request.body.user)
          acc[key] = ctx.request.body.user[key]
        return acc
      },
      {}
    )

    const user = await ctx.state.user.update(attrs)
    const json = await new MyProfileSerializer(user).promiseToJSON()
    ctx.body = json
  }

  static async updatePassword(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Not found' };
      return
    }

    const currentPassword = ctx.request.body.currentPassword || ''
    const valid = await ctx.state.user.validPassword(currentPassword)

    if (!valid)
      throw new Error('Your old password is not valid')

    await ctx.state.user.updatePassword(ctx.request.body.password, ctx.request.body.passwordConfirmation)
    ctx.body = { message: 'Your password has been changed' };
  }

  static async updateProfilePicture(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Not found' };
      return
    }

    const fileHandlerPromises = Object.values(ctx.request.body.files).map(async (file) => {
      await ctx.state.user.updateProfilePicture(file)
      ctx.body = { message: 'Your profile picture has been updated' };
    });

    await Promise.all(fileHandlerPromises);
  }
}

import monitor from 'monitor-dog'
import { dbAdapter, TimelineSerializer } from '../../../models'
import { NotFoundException } from '../../../support/exceptions'


export default class TimelineController {
  static async home(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Not found', status: 'fail' };
      return
    }

    const timer = monitor.timer('timelines.homefeed-time')

    try {
      const user = ctx.state.user

      const timeline = await user.getRiverOfNewsTimeline({
        offset:      ctx.request.query.offset,
        limit:       ctx.request.query.limit,
        currentUser: user.id
      })

      const json = await new TimelineSerializer(timeline).promiseToJSON()
      ctx.body = json

      monitor.increment('timelines.homefeed-requests')
    } finally {
      timer.stop()
    }
  }

  static async directs(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Not found', status: 'fail' };
      return
    }

    const timer = monitor.timer('timelines.directs_feed-time')

    try {
      const user = ctx.state.user
      const timeline = await user.getDirectsTimeline({
        offset:      ctx.request.query.offset,
        limit:       ctx.request.query.limit,
        currentUser: user.id
      })

      const json = await new TimelineSerializer(timeline).promiseToJSON()
      ctx.body = json

      monitor.increment('timelines.directs_feed-requests')
    } finally {
      timer.stop()
    }
  }

  static async posts(ctx) {
    const timer = monitor.timer('timelines.posts_feed-time')

    try {
      const username = ctx.params.username
      const user = await dbAdapter.getFeedOwnerByUsername(username)

      if (null === user) {
        throw new NotFoundException(`Feed "${username}" is not found`)
      }

      if (user.hashedPassword === '') {
        throw new NotFoundException(`Feed "${username}" is not found`);
      }

      const currentUser = ctx.state.user ? ctx.state.user.id : null
      const timeline = await user.getPostsTimeline({
        offset: ctx.request.query.offset,
        limit:  ctx.request.query.limit,
        currentUser
      })

      await timeline.loadVisibleSubscribersAndAdmins(user, ctx.state.user)

      const json = await new TimelineSerializer(timeline).promiseToJSON()
      ctx.body = json

      monitor.increment('timelines.posts_feed-requests')
    } finally {
      timer.stop()
    }
  }

  static async likes(ctx) {
    const timer = monitor.timer('timelines.likes_feed-time')

    try {
      const username = ctx.params.username
      const user = await dbAdapter.getUserByUsername(username)

      if (null === user) {
        throw new NotFoundException(`User "${ctx.params.username}" is not found`)
      }

      if (user.hashedPassword === '') {
        throw new NotFoundException(`Feed "${username}" is not found`);
      }

      const currentUser = ctx.state.user ? ctx.state.user.id : null
      const timeline = await user.getLikesTimeline({
        offset: ctx.request.query.offset,
        limit:  ctx.request.query.limit,
        currentUser
      })

      await timeline.loadVisibleSubscribersAndAdmins(user, ctx.state.user)

      const json = await new TimelineSerializer(timeline).promiseToJSON()
      ctx.body = json

      monitor.increment('timelines.likes_feed-requests')
    } finally {
      timer.stop()
    }
  }

  static async comments(ctx) {
    const timer = monitor.timer('timelines.comments_feed-time')

    try {
      const username = ctx.params.username
      const user = await dbAdapter.getUserByUsername(username)

      if (null === user) {
        throw new NotFoundException(`User "${ctx.params.username}" is not found`)
      }

      if (user.hashedPassword === '') {
        throw new NotFoundException(`Feed "${username}" is not found`);
      }

      const currentUser = ctx.state.user ? ctx.state.user.id : null
      const timeline = await user.getCommentsTimeline({
        offset: ctx.request.query.offset,
        limit:  ctx.request.query.limit,
        currentUser
      })

      await timeline.loadVisibleSubscribersAndAdmins(user, ctx.state.user)

      const json = await new TimelineSerializer(timeline).promiseToJSON()
      ctx.body = json

      monitor.increment('timelines.comments_feed-requests')
    } finally {
      timer.stop()
    }
  }

  static async myDiscussions(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Not found', status: 'fail' };
      return
    }

    const user = ctx.state.user
    const timer = monitor.timer('timelines.my_discussions_feed-time')

    try {
      const timeline = await user.getMyDiscussionsTimeline({
        offset:      ctx.request.query.offset,
        limit:       ctx.request.query.limit,
        currentUser: user.id
      })

      const json = await new TimelineSerializer(timeline).promiseToJSON()
      ctx.body = json

      monitor.increment('timelines.my_discussions_feed-requests')
    } finally {
      timer.stop()
    }
  }
}

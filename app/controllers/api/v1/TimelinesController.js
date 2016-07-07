import monitor from 'monitor-dog'
import { dbAdapter, TimelineSerializer } from '../../../models'
import exceptions, { NotFoundException } from '../../../support/exceptions'


export default class TimelineController {
  static async home(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found', status: 'fail' })
      return
    }

    let timer = monitor.timer('timelines.homefeed-time')

    try {
      var user = req.user

      let timeline = await user.getRiverOfNewsTimeline({
        offset:      req.query.offset,
        limit:       req.query.limit,
        currentUser: user.id
      })

      let json = await new TimelineSerializer(timeline).promiseToJSON()
      res.jsonp(json)

      monitor.increment('timelines.homefeed-requests')
    } catch (e) {
      exceptions.reportError(res)(e)
    } finally {
      timer.stop()
    }
  }

  static async directs(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found', status: 'fail' })
      return
    }

    let timer = monitor.timer('timelines.directs_feed-time')

    try {
      const user = req.user
      const timeline = await user.getDirectsTimeline({
        offset:      req.query.offset,
        limit:       req.query.limit,
        currentUser: user.id
      })

      let json = await new TimelineSerializer(timeline).promiseToJSON()
      res.jsonp(json)

      monitor.increment('timelines.directs_feed-requests')
    } catch (e) {
      exceptions.reportError(res)(e)
    } finally {
      timer.stop()
    }
  }

  static async posts(req, res) {
    let timer = monitor.timer('timelines.posts_feed-time')

    try {
      var username = req.params.username

      const user = await dbAdapter.getFeedOwnerByUsername(username)

      if (null === user) {
        throw new NotFoundException(`Feed "${username}" is not found`)
      }

      var currentUser = req.user ? req.user.id : null
      var timeline = await user.getPostsTimeline({
        offset:      req.query.offset,
        limit:       req.query.limit,
        currentUser: currentUser
      })

      await timeline.loadVisibleSubscribersAndAdmins(user, req.user)

      let json = await new TimelineSerializer(timeline).promiseToJSON()
      res.jsonp(json)

      monitor.increment('timelines.posts_feed-requests')
    } catch (e) {
      exceptions.reportError(res)(e)
    } finally {
      timer.stop()
    }
  }

  static async likes(req, res) {
    let timer = monitor.timer('timelines.likes_feed-time')

    try {
      var username = req.params.username

      const user = await dbAdapter.getUserByUsername(username)

      if (null === user) {
        throw new NotFoundException(`User "${req.params.username}" is not found`)
      }

      var currentUser = req.user ? req.user.id : null
      var timeline = await user.getLikesTimeline({
        offset:      req.query.offset,
        limit:       req.query.limit,
        currentUser: currentUser
      })

      await timeline.loadVisibleSubscribersAndAdmins(user, req.user)

      let json = await new TimelineSerializer(timeline).promiseToJSON()
      res.jsonp(json)

      monitor.increment('timelines.likes_feed-requests')
    } catch (e) {
      exceptions.reportError(res)(e)
    } finally {
      timer.stop()
    }
  }

  static async comments(req, res) {
    let timer = monitor.timer('timelines.comments_feed-time')

    try {
      var username = req.params.username

      const user = await dbAdapter.getUserByUsername(username)

      if (null === user) {
        throw new NotFoundException(`User "${req.params.username}" is not found`)
      }

      var currentUser = req.user ? req.user.id : null
      var timeline = await user.getCommentsTimeline({
        offset:      req.query.offset,
        limit:       req.query.limit,
        currentUser: currentUser
      })

      await timeline.loadVisibleSubscribersAndAdmins(user, req.user)

      let json = await new TimelineSerializer(timeline).promiseToJSON()
      res.jsonp(json)

      monitor.increment('timelines.comments_feed-requests')
    } catch (e) {
      exceptions.reportError(res)(e)
    } finally {
      timer.stop()
    }
  }

  static async myDiscussions (req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found', status: 'fail'})
      return
    }

    var user = req.user
    let timer = monitor.timer('timelines.my_discussions_feed-time')

    try {
      let timeline = await user.getMyDiscussionsTimeline({
        offset:      req.query.offset,
        limit:       req.query.limit,
        currentUser: req.user ? req.user.id : null
      })

      let json = await new TimelineSerializer(timeline).promiseToJSON()
      res.jsonp(json)

      monitor.increment('timelines.my_discussions_feed-requests')
    } catch (e) {
      exceptions.reportError(res)(e)
    } finally {
      timer.stop()
    }
  }
}

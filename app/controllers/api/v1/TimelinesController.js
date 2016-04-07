import { pgAdapter, TimelineSerializer } from '../../../models'
import exceptions, { NotFoundException } from '../../../support/exceptions'


export default class TimelineController {
  static async home(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found', status: 'fail' })
      return
    }

    try {
      var user = req.user

      let timeline = await user.getRiverOfNewsTimeline({
        offset: req.query.offset,
        limit: req.query.limit,
        currentUser: user.id
      })

      let json = await new TimelineSerializer(timeline).promiseToJSON()
      res.jsonp(json)
    } catch (e) {
      exceptions.reportError(res)(e)
    }
  }

  static async directs(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found', status: 'fail' })
      return
    }

    try {
      const user = req.user
      const timeline = await user.getDirectsTimeline({
        offset: req.query.offset,
        limit: req.query.limit,
        currentUser: user.id
      })

      let json = await new TimelineSerializer(timeline).promiseToJSON()
      res.jsonp(json)
    } catch (e) {
      exceptions.reportError(res)(e)
    }
  }

  static async posts(req, res) {
    try {
      var username = req.params.username

      const user = await pgAdapter.getFeedOwnerByUsername(username)

      if (null === user) {
        throw new NotFoundException(`Feed "${username}" is not found`)
      }

      var currentUser = req.user ? req.user.id : null
      var timeline = await user.getPostsTimeline({
        offset: req.query.offset,
        limit: req.query.limit,
        currentUser: currentUser
      })

      let json = await new TimelineSerializer(timeline).promiseToJSON()
      res.jsonp(json)
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  static async likes(req, res) {
    try {
      var username = req.params.username

      const user = await pgAdapter.getUserByUsername(username)

      if (null === user) {
        throw new NotFoundException(`User "${req.params.username}" is not found`)
      }

      var currentUser = req.user ? req.user.id : null
      var timeline = await user.getLikesTimeline({
        offset: req.query.offset,
        limit: req.query.limit,
        currentUser: currentUser
      })

      let json = await new TimelineSerializer(timeline).promiseToJSON()
      res.jsonp(json)
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  static async comments(req, res) {
    try {
      var username = req.params.username

      const user = await pgAdapter.getUserByUsername(username)

      if (null === user) {
        throw new NotFoundException(`User "${req.params.username}" is not found`)
      }

      var currentUser = req.user ? req.user.id : null
      var timeline = await user.getCommentsTimeline({
        offset: req.query.offset,
        limit: req.query.limit,
        currentUser: currentUser
      })

      let json = await new TimelineSerializer(timeline).promiseToJSON()
      res.jsonp(json)
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  static async myDiscussions (req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found', status: 'fail'})
      return
    }

    var user = req.user

    try {
      let timeline = await user.getMyDiscussionsTimeline({
        offset: req.query.offset,
        limit: req.query.limit,
        currentUser: req.user ? req.user.id : null
      })

      let json = await new TimelineSerializer(timeline).promiseToJSON()
      res.jsonp(json)
    } catch (e) {
      exceptions.reportError(res)(e)
    }
  }
}

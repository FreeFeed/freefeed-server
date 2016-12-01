import formidable from 'formidable'
import _ from 'lodash'

import { dbAdapter, Group, GroupSerializer } from '../../../models'
import { reportError, BadRequestException, NotFoundException, ForbiddenException }  from '../../../support/exceptions'


export default class GroupsController {
  static async create(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Unauthorized', status: 'fail' })
      return
    }

    if (!req.body.group) {
      res.status(400).jsonp({ err: 'Malformed request', status: 'fail' })
      return
    }

    const params = GroupsController._filteredParams(req.body.group, ['username', 'screenName', 'description', 'isPrivate', 'isProtected', 'isRestricted'])

    try {
      const group = new Group(params)
      await group.create(req.user.id, false)

      const json = await new GroupSerializer(group).promiseToJSON()
      res.jsonp(json)
    } catch (e) {
      reportError(res)(e)
    }
  }

  static async sudoCreate(req, res) {
    const params = GroupsController._filteredParams(req.body.group, ['username', 'screenName', 'isPrivate', 'isProtected', 'isRestricted'])

    try {
      if (!_.isArray(req.body.admins)) {
        throw new BadRequestException('"admins" should be an array of strings')
      }

      const adminPromises = req.body.admins.map(async (username) => {
        const admin = await dbAdapter.getUserByUsername(username)
        return (null === admin) ? false : admin;
      })
      let admins = await Promise.all(adminPromises)
      admins = admins.filter(Boolean)

      const group = new Group(params)
      await group.create(admins[0].id, true)

      // starting iteration from the second admin
      const promises = [];
      for (let i = 1; i < admins.length; i++) {
        const adminId = admins[i].id;

        promises.push(group.addAdministrator(adminId))
        promises.push(group.subscribeOwner(adminId))
      }

      await Promise.all(promises)

      const json = await new GroupSerializer(group).promiseToJSON()
      res.jsonp(json)
    } catch (e) {
      reportError(res)(e)
    }
  }

  static async update(req, res) {
    if (!req.user) {
      res.status(403).jsonp({ err: 'You need to log in before you can manage groups', status: 'fail' })
      return
    }
    const attrs = GroupsController._filteredParams(req.body.user, ['screenName', 'description', 'isPrivate', 'isProtected', 'isRestricted'])

    try {
      const group = await dbAdapter.getGroupById(req.params.userId)
      if (null === group) {
        throw new NotFoundException("Can't find group")
      }

      const adminIds = await group.getAdministratorIds()
      if (!adminIds.includes(req.user.id)) {
        throw new ForbiddenException("You aren't an administrator of this group")
      }

      await group.update(attrs)

      const json = await new GroupSerializer(group).promiseToJSON()
      res.jsonp(json)
    } catch (e) {
      reportError(res)(e)
    }
  }

  static async changeAdminStatus(req, res, newStatus) {
    if (!req.user) {
      res.status(403).jsonp({ err: 'You need to log in before you can manage groups', status: 'fail' })
      return
    }

    try {
      const group = await dbAdapter.getGroupByUsername(req.params.groupName)

      if (null === group) {
        throw new NotFoundException(`Group "${req.params.groupName}" is not found`)
      }

      const adminIds = await group.getAdministratorIds()
      if (!adminIds.includes(req.user.id)) {
        throw new ForbiddenException("You aren't an administrator of this group")
      }

      const newAdmin = await dbAdapter.getUserByUsername(req.params.adminName)

      if (null === newAdmin) {
        throw new NotFoundException(`User "${req.params.adminName}" is not found`)
      }

      if (newStatus) {
        await group.addAdministrator(newAdmin.id)
      } else {
        await group.removeAdministrator(newAdmin.id)
      }

      res.jsonp({ err: null, status: 'success' })
    } catch (e) {
      reportError(res)(e)
    }
  }

  static admin(req, res) {
    GroupsController.changeAdminStatus(req, res, true)
  }

  static unadmin(req, res) {
    GroupsController.changeAdminStatus(req, res, false)
  }

  static async updateProfilePicture(req, res) {
    if (!req.user) {
      res.status(403).jsonp({ err: 'You need to log in before you can manage groups', status: 'fail' })
      return
    }
    try {
      const group = await dbAdapter.getGroupByUsername(req.params.groupName)

      if (null === group) {
        throw new NotFoundException(`User "${req.params.groupName}" is not found`)
      }

      const adminIds = await group.getAdministratorIds()
      if (!adminIds.includes(req.user.id)) {
        throw new ForbiddenException("You aren't an administrator of this group")
      }

      const form = new formidable.IncomingForm()

      form.on('file', async (inputName, file) => {
        try {
          await group.updateProfilePicture(file)
          res.jsonp({ message: 'The profile picture of the group has been updated' })
        } catch (e) {
          reportError(res)(e)
        }
      })

      form.parse(req)
    } catch (e) {
      reportError(res)(e)
    }
  }

  static async sendRequest(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Unauthorized', status: 'fail' })
      return
    }

    const groupName = req.params.groupName
    try {
      const group = await dbAdapter.getGroupByUsername(groupName)

      if (null === group) {
        throw new NotFoundException(`Group "${groupName}" is not found`)
      }

      if (group.isPrivate !== '1') {
        throw new Error('Group is public')
      }

      const hasRequest = await dbAdapter.isSubscriptionRequestPresent(req.user.id, group.id)
      if (hasRequest) {
        throw new ForbiddenException('Subscription request already sent')
      }

      const followedGroups = await req.user.getFollowedGroups()
      const followedGroupIds = followedGroups.map((group) => {
        return group.id
      })

      if (followedGroupIds.includes(group.id)) {
        throw new ForbiddenException('You are already subscribed to that group')
      }

      await req.user.sendPrivateGroupSubscriptionRequest(group.id)

      res.jsonp({ err: null, status: 'success' })
    } catch (e) {
      reportError(res)(e)
    }
  }

  static async acceptRequest(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Unauthorized', status: 'fail' })
      return
    }

    const groupName = req.params.groupName
    const userName = req.params.userName
    try {
      const group = await dbAdapter.getGroupByUsername(groupName)

      if (null === group) {
        throw new NotFoundException(`Group "${groupName}" is not found`)
      }

      const adminIds = await group.getAdministratorIds()
      if (!adminIds.includes(req.user.id)) {
        throw new ForbiddenException("You aren't an administrator of this group")
      }

      const user = await dbAdapter.getUserByUsername(userName)
      if (null === user) {
        throw new NotFoundException(`User "${userName}" is not found`)
      }

      const hasRequest = await dbAdapter.isSubscriptionRequestPresent(user.id, group.id)
      if (!hasRequest) {
        throw new Error('Subscription request is not found')
      }

      await group.acceptSubscriptionRequest(user.id)

      res.jsonp({ err: null, status: 'success' })
    } catch (e) {
      reportError(res)(e)
    }
  }

  static async rejectRequest(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Unauthorized', status: 'fail' })
      return
    }

    const groupName = req.params.groupName
    const userName = req.params.userName
    try {
      const group = await dbAdapter.getGroupByUsername(groupName)

      if (null === group) {
        throw new NotFoundException(`Group "${groupName}" is not found`)
      }

      const adminIds = await group.getAdministratorIds()
      if (!adminIds.includes(req.user.id)) {
        throw new ForbiddenException("You aren't an administrator of this group")
      }

      const user = await dbAdapter.getUserByUsername(userName)
      if (null === user) {
        throw new NotFoundException(`User "${userName}" is not found`)
      }

      const hasRequest = await dbAdapter.isSubscriptionRequestPresent(user.id, group.id)
      if (!hasRequest) {
        throw new Error('Invalid')
      }

      await group.rejectSubscriptionRequest(user.id)

      res.jsonp({ err: null, status: 'success' })
    } catch (e) {
      reportError(res)(e)
    }
  }

  static async unsubscribeFromGroup(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Unauthorized', status: 'fail' })
      return
    }

    const groupName = req.params.groupName
    const userName = req.params.userName
    try {
      const group = await dbAdapter.getGroupByUsername(groupName)

      if (null === group) {
        throw new NotFoundException(`Group "${groupName}" is not found`)
      }

      const adminIds = await group.getAdministratorIds()
      if (!adminIds.includes(req.user.id)) {
        throw new ForbiddenException("You aren't an administrator of this group")
      }

      const user = await dbAdapter.getUserByUsername(userName)
      if (null === user) {
        throw new NotFoundException(`User "${userName}" is not found`)
      }
      const timelineId = await group.getPostsTimelineId()
      if (adminIds.includes(user.id)) {
        throw new ForbiddenException('Group administrators cannot be unsubscribed from own groups')
      }

      const isSubscribed = await dbAdapter.isUserSubscribedToTimeline(user.id, timelineId)
      if (!isSubscribed) {
        throw new ForbiddenException('You are not subscribed to that user')
      }

      await user.unsubscribeFrom(timelineId)

      res.jsonp({ err: null, status: 'success' })
    } catch (e) {
      reportError(res)(e)
    }
  }

  static _filteredParams(modelDescr, allowedParams) {
    return _.pick(modelDescr, allowedParams)
  }
}

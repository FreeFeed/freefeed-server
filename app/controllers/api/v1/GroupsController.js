import formidable from 'formidable'
import _ from 'lodash'

import { dbAdapter, Group, GroupSerializer } from '../../../models'
import exceptions, { NotFoundException, ForbiddenException }  from '../../../support/exceptions'


export default class GroupsController {
  static async create(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Unauthorized', status: 'fail'})
      return
    }

    if (!req.body.group) {
      res.status(400).jsonp({ err: 'Malformed request', status: 'fail'})
      return
    }

    let params = GroupsController._filteredParams(req.body.group, ['username', 'screenName', 'description', 'isPrivate', 'isRestricted'])

    try {
      var group = new Group(params)
      await group.create(req.user.id, false)

      var json = await new GroupSerializer(group).promiseToJSON()
      res.jsonp(json)
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  static async sudoCreate(req, res) {
    let params = GroupsController._filteredParams(req.body.group, ['username', 'screenName', 'isPrivate', 'isRestricted'])

    try {
      if (!_.isArray(req.body.admins)) {
        throw new exceptions.BadRequestException('"admins" should be an array of strings')
      }

      let adminPromises = req.body.admins.map(async (username) => {
        const admin = await dbAdapter.getUserByUsername(username)
        return (null === admin) ? false : admin;
      })
      let admins = await Promise.all(adminPromises)
      admins = admins.filter(Boolean)

      let group = new Group(params)
      await group.create(admins[0].id, true)

      // starting iteration from the second admin
      let promises = [];
      for (let i = 1; i < admins.length; i++) {
        let adminId = admins[i].id;

        promises.push(group.addAdministrator(adminId))
        promises.push(group.subscribeOwner(adminId))
      }

      await Promise.all(promises)

      let json = await new GroupSerializer(group).promiseToJSON()
      res.jsonp(json)
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  static async update(req, res) {
    let attrs = GroupsController._filteredParams(req.body.user, ['screenName', 'description', 'isPrivate', 'isRestricted'])

    try {
      const group = await dbAdapter.getGroupById(req.params.userId)
      if (null === group) {
        throw new NotFoundException("Can't find group")
      }

      await group.validateCanUpdate(req.user)
      await group.update(attrs)

      var json = await new GroupSerializer(group).promiseToJSON()
      res.jsonp(json)
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  static async changeAdminStatus(req, res, newStatus) {
    try {
      const group = await dbAdapter.getGroupByUsername(req.params.groupName)

      if (null === group) {
        throw new NotFoundException(`Group "${req.params.groupName}" is not found`)
      }

      await group.validateCanUpdate(req.user)

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
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  static admin(req, res) {
    GroupsController.changeAdminStatus(req, res, true)
  }

  static unadmin(req, res) {
    GroupsController.changeAdminStatus(req, res, false)
  }

  static async updateProfilePicture(req, res) {
    try {
      const group = await dbAdapter.getGroupByUsername(req.params.groupName)

      if (null === group) {
        throw new NotFoundException(`User "${req.params.groupName}" is not found`)
      }

      await group.validateCanUpdate(req.user)

      var form = new formidable.IncomingForm()

      form.on('file', async (inputName, file) => {
        try {
          await group.updateProfilePicture(file)
          res.jsonp({ message: 'The profile picture of the group has been updated' })
        } catch (e) {
          exceptions.reportError(res)(e)
        }
      })

      form.parse(req)
    } catch (e) {
      exceptions.reportError(res)(e)
    }
  }

  static async sendRequest(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Unauthorized', status: 'fail'})
      return
    }

    const groupName = req.params.groupName
    try {
      const group = await dbAdapter.getGroupByUsername(groupName)

      if (null === group) {
        throw new NotFoundException(`Group "${groupName}" is not found`)
      }

      if (group.isPrivate !== '1') {
        throw new Error("Group is public")
      }

      const hasRequest = await dbAdapter.isSubscriptionRequestPresent(req.user.id, group.id)
      if (hasRequest) {
        throw new ForbiddenException("Subscription request already sent")
      }

      const followedGroups = await req.user.getFollowedGroups()
      const followedGroupIds = followedGroups.map((group) => {
        return group.id
      })

      if ( _.includes(followedGroupIds, group.id) ) {
        throw new ForbiddenException("You are already subscribed to that group")
      }

      await req.user.sendPrivateGroupSubscriptionRequest(group.id)

      res.jsonp({ err: null, status: 'success' })
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  static async acceptRequest(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Unauthorized', status: 'fail'})
      return
    }

    const groupName = req.params.groupName
    const userName = req.params.userName
    try {
      let group = await dbAdapter.getGroupByUsername(groupName)

      if (null === group) {
        throw new NotFoundException(`Group "${groupName}" is not found`)
      }
      await group.validateCanUpdate(req.user)

      const user = await dbAdapter.getUserByUsername(userName)
      if (null === user) {
        throw new NotFoundException(`User "${userName}" is not found`)
      }

      const hasRequest = await dbAdapter.isSubscriptionRequestPresent(user.id, group.id)
      if (!hasRequest) {
        throw new Error("Invalid")
      }

      await group.acceptSubscriptionRequest(user.id)

      res.jsonp({ err: null, status: 'success' })
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  static async rejectRequest(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Unauthorized', status: 'fail'})
      return
    }

    const groupName = req.params.groupName
    const userName = req.params.userName
    try {
      let group = await dbAdapter.getGroupByUsername(groupName)

      if (null === group) {
        throw new NotFoundException(`Group "${groupName}" is not found`)
      }
      await group.validateCanUpdate(req.user)

      const user = await dbAdapter.getUserByUsername(userName)
      if (null === user) {
        throw new NotFoundException(`User "${userName}" is not found`)
      }

      const hasRequest = await dbAdapter.isSubscriptionRequestPresent(user.id, group.id)
      if (!hasRequest) {
        throw new Error("Invalid")
      }

      await group.rejectSubscriptionRequest(user.id)

      res.jsonp({ err: null, status: 'success' })
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  static async unsubscribeFromGroup(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Unauthorized', status: 'fail'})
      return
    }

    const groupName = req.params.groupName
    const userName = req.params.userName
    try {
      let group = await dbAdapter.getGroupByUsername(groupName)

      if (null === group) {
        throw new NotFoundException(`Group "${groupName}" is not found`)
      }
      await group.validateCanUpdate(req.user)

      let user = await dbAdapter.getUserByUsername(userName)
      if (null === user) {
        throw new NotFoundException(`User "${userName}" is not found`)
      }
      let timelineId = await group.getPostsTimelineId()
      await group.validateUserCanBeUnsubscribed(user)

      const timelineIds = await user.getSubscriptionIds()
      if (!_.includes(timelineIds, timelineId)) {
        throw new ForbiddenException("You are not subscribed to that user")
      }

      const adminIds = await group.getAdministratorIds()
      if (_.includes(adminIds, user.id)) {
        throw new ForbiddenException("Group administrators cannot unsubscribe from own groups")
      }

      await user.unsubscribeFrom(timelineId)

      res.jsonp({ err: null, status: 'success' })
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  static _filteredParams(modelDescr, allowedParams){
    return _.pick(modelDescr, allowedParams)
  }
}

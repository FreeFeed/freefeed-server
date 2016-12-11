import _ from 'lodash';

import { dbAdapter, Group, GroupSerializer } from '../../../models'
import { BadRequestException, NotFoundException, ForbiddenException }  from '../../../support/exceptions'


export default class GroupsController {
  static async create(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Unauthorized', status: 'fail' };
      return
    }

    if (!ctx.request.body.group) {
      ctx.status = 400;
      ctx.body = { err: 'Malformed request', status: 'fail' };
      return
    }

    const params = GroupsController._filteredParams(ctx.request.body.group, ['username', 'screenName', 'description', 'isPrivate', 'isProtected', 'isRestricted']);

    const group = new Group(params)
    await group.create(ctx.state.user.id, false)

    const json = await new GroupSerializer(group).promiseToJSON()
    ctx.body = json;
  }

  static async sudoCreate(ctx) {
    const params = GroupsController._filteredParams(ctx.request.body.group, ['username', 'screenName', 'isPrivate', 'isProtected', 'isRestricted'])

    if (!_.isArray(ctx.request.body.admins)) {
      throw new BadRequestException('"admins" should be an array of strings')
    }

    const adminPromises = ctx.request.body.admins.map(async (username) => {
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
    ctx.body = json
  }

  static async update(ctx) {
    if (!ctx.state.user) {
      ctx.status = 403;
      ctx.body = { err: 'You need to log in before you can manage groups', status: 'fail' };
      return
    }

    const attrs = GroupsController._filteredParams(ctx.request.body.user, ['screenName', 'description', 'isPrivate', 'isProtected', 'isRestricted'])

    const group = await dbAdapter.getGroupById(ctx.params.userId)
    if (null === group) {
      throw new NotFoundException("Can't find group")
    }

    const adminIds = await group.getAdministratorIds()
    if (!adminIds.includes(ctx.state.user.id)) {
      throw new ForbiddenException("You aren't an administrator of this group")
    }

    await group.update(attrs)

    const json = await new GroupSerializer(group).promiseToJSON()
    ctx.body = json;
  }

  static async changeAdminStatus(ctx, newStatus) {
    if (!ctx.state.user) {
      ctx.status = 403;
      ctx.body = { err: 'You need to log in before you can manage groups', status: 'fail' };
      return
    }

    const group = await dbAdapter.getGroupByUsername(ctx.params.groupName)

    if (null === group) {
      throw new NotFoundException(`Group "${ctx.params.groupName}" is not found`)
    }

    const adminIds = await group.getAdministratorIds()
    if (!adminIds.includes(ctx.state.user.id)) {
      throw new ForbiddenException("You aren't an administrator of this group")
    }

    const newAdmin = await dbAdapter.getUserByUsername(ctx.params.adminName)

    if (null === newAdmin) {
      throw new NotFoundException(`User "${ctx.params.adminName}" is not found`)
    }

    if (newStatus) {
      await group.addAdministrator(newAdmin.id)
    } else {
      await group.removeAdministrator(newAdmin.id)
    }

    ctx.body = { err: null, status: 'success' };
  }

  static async admin(ctx) {
    await GroupsController.changeAdminStatus(ctx, true);
  }

  static async unadmin(ctx) {
    await GroupsController.changeAdminStatus(ctx, false);
  }

  static async updateProfilePicture(ctx) {
    if (!ctx.state.user) {
      ctx.status = 403;
      ctx.body = { err: 'You need to log in before you can manage groups', status: 'fail' };
      return
    }

    const group = await dbAdapter.getGroupByUsername(ctx.params.groupName)

    if (null === group) {
      throw new NotFoundException(`User "${ctx.params.groupName}" is not found`)
    }

    const adminIds = await group.getAdministratorIds()
    if (!adminIds.includes(ctx.state.user.id)) {
      throw new ForbiddenException("You aren't an administrator of this group")
    }

    const fileHandlerPromises = Object.values(ctx.request.body.files).map(async (file) => {
      await group.updateProfilePicture(file);
      ctx.body = { message: 'The profile picture of the group has been updated' };
    });

    await Promise.all(fileHandlerPromises);
  }

  static async sendRequest(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Unauthorized', status: 'fail' };
      return
    }

    const groupName = ctx.params.groupName
    const group = await dbAdapter.getGroupByUsername(groupName)

    if (null === group) {
      throw new NotFoundException(`Group "${groupName}" is not found`)
    }

    if (group.isPrivate !== '1') {
      throw new Error('Group is public')
    }

    const hasRequest = await dbAdapter.isSubscriptionRequestPresent(ctx.state.user.id, group.id)
    if (hasRequest) {
      throw new ForbiddenException('Subscription request already sent')
    }

    const followedGroups = await ctx.state.user.getFollowedGroups()
    const followedGroupIds = followedGroups.map((group) => {
      return group.id
    })

    if (followedGroupIds.includes(group.id)) {
      throw new ForbiddenException('You are already subscribed to that group')
    }

    await ctx.state.user.sendPrivateGroupSubscriptionRequest(group.id)

    ctx.body = { err: null, status: 'success' };
  }

  static async acceptRequest(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Unauthorized', status: 'fail' };
      return
    }

    const groupName = ctx.params.groupName
    const userName = ctx.params.userName
    const group = await dbAdapter.getGroupByUsername(groupName)

    if (null === group) {
      throw new NotFoundException(`Group "${groupName}" is not found`)
    }

    const adminIds = await group.getAdministratorIds()
    if (!adminIds.includes(ctx.state.user.id)) {
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

    ctx.body = { err: null, status: 'success' };
  }

  static async rejectRequest(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Unauthorized', status: 'fail' };
      return
    }

    const groupName = ctx.params.groupName
    const userName = ctx.params.userName
    const group = await dbAdapter.getGroupByUsername(groupName)

    if (null === group) {
      throw new NotFoundException(`Group "${groupName}" is not found`)
    }

    const adminIds = await group.getAdministratorIds()
    if (!adminIds.includes(ctx.state.user.id)) {
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

    ctx.body = { err: null, status: 'success' };
  }

  static async unsubscribeFromGroup(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Unauthorized', status: 'fail' };
      return
    }

    const groupName = ctx.params.groupName
    const userName = ctx.params.userName
    const group = await dbAdapter.getGroupByUsername(groupName)

    if (null === group) {
      throw new NotFoundException(`Group "${groupName}" is not found`)
    }

    const adminIds = await group.getAdministratorIds()
    if (!adminIds.includes(ctx.state.user.id)) {
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

    ctx.body = { err: null, status: 'success' };
  }

  static _filteredParams(modelDescr, allowedParams) {
    return _.pick(modelDescr, allowedParams)
  }
}

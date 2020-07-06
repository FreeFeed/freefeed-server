import _ from 'lodash';
import compose from 'koa-compose';

import { dbAdapter, Group, AppTokenV1 } from '../../../models'
import { EventService } from '../../../support/EventService'
import { BadRequestException, NotFoundException, ForbiddenException }  from '../../../support/exceptions'
import { authRequired, targetUserRequired } from '../../middlewares';
import { downloadURL } from '../../../support/download-url';

import UsersController from './UsersController';


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
    await EventService.onGroupCreated(ctx.state.user.intId, group.intId);

    // The same output as of the UsersController.show with 'users' -> 'groups' replacing
    ctx.params['username'] = group.username;
    await UsersController.show(ctx);
    ctx.body.groups = ctx.body.users;
    Reflect.deleteProperty(ctx.body, 'users');

    AppTokenV1.addLogPayload(ctx, { groupId: group.id });
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

    // The same output as of the UsersController.show with 'users' -> 'groups' replacing
    ctx.params['username'] = group.username;
    await UsersController.show(ctx);
    ctx.body.groups = ctx.body.users;
    Reflect.deleteProperty(ctx.body, 'users');
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

    // The same output as of the UsersController.show with 'users' -> 'groups' replacing
    ctx.params['username'] = group.username;
    await UsersController.show(ctx);
    ctx.body.groups = ctx.body.users;
    Reflect.deleteProperty(ctx.body, 'users');
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

    if (newStatus && !newAdmin.isActive) {
      throw new ForbiddenException(`User "${ctx.params.adminName}" is not active`);
    }

    if (newStatus) {
      await group.addAdministrator(newAdmin.id)
      await EventService.onGroupAdminPromoted(ctx.state.user.intId, group, newAdmin.intId);
    } else {
      await group.removeAdministrator(newAdmin.id)
      await EventService.onGroupAdminDemoted(ctx.state.user.intId, group, newAdmin.intId);
    }

    ctx.body = { err: null, status: 'success' };
  }

  static async admin(ctx) {
    await GroupsController.changeAdminStatus(ctx, true);
  }

  static async unadmin(ctx) {
    await GroupsController.changeAdminStatus(ctx, false);
  }

  /**
   * File can be sent as 'file' field of multipart/form-data request
   * or as 'url' field of regular JSON body. In the latter case the
   * server will download file from the given url.
   */
  static updateProfilePicture = compose([
    authRequired(),
    targetUserRequired({ groupName: 'group' }),
    async (ctx) => {
      const { user, group } = ctx.state;

      const adminIds = await group.getAdministratorIds();

      if (!adminIds.includes(user.id)) {
        throw new ForbiddenException("You aren't an administrator of this group");
      }

      let filePath = null;

      if (ctx.request.files && ctx.request.files.file) {
        filePath = ctx.request.files.file.path;
      } else if (ctx.request.body.url) {
        const fileInfo = await downloadURL(ctx.request.body.url);

        if (!/^image\//.test(fileInfo.type)) {
          await fileInfo.unlink();
          throw new Error(`Unsupported content type: '${fileInfo.type}'`);
        }

        filePath = fileInfo.path;
      }

      if (!filePath) {
        throw new BadRequestException('Neither file nor URL was found');
      }

      await group.updateProfilePicture(filePath);
      ctx.body = { message: 'The profile picture of the group has been updated' };
    },
  ]);

  static sendRequest = (ctx) => {
    ctx.params.username = ctx.params.groupName;
    return UsersController.sendRequest(ctx);
  };

  static acceptRequest = compose([
    authRequired(),
    targetUserRequired({ userName: 'subscriber', groupName: 'group' }),
    async (ctx) => {
      const { user: thisUser, subscriber, group } = ctx.state;

      const adminIds = await group.getAdministratorIds();

      if (!adminIds.includes(thisUser.id)) {
        throw new ForbiddenException("You aren't an administrator of this group");
      }

      const ok = await group.acceptSubscriptionRequest(subscriber, thisUser);

      if (!ok) {
        throw new Error('Subscription request is not found')
      }

      ctx.body = {};
    }
  ]);

  static async rejectRequest(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Unauthorized', status: 'fail' };
      return
    }

    const { groupName, userName } = ctx.params;
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
    await EventService.onGroupSubscriptionRequestRejected(ctx.state.user.intId, group, user.intId);

    ctx.body = { err: null, status: 'success' };
  }

  static async unsubscribeFromGroup(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Unauthorized', status: 'fail' };
      return
    }

    const { groupName, userName } = ctx.params;
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

    if (adminIds.includes(user.id)) {
      throw new ForbiddenException('Group administrators cannot be unsubscribed from own groups')
    }

    const success = await user.unsubscribeFrom(group);

    if (!success) {
      throw new ForbiddenException('This user is not subscribed to that group');
    }

    ctx.body = { err: null, status: 'success' };
  }

  static _filteredParams(modelDescr, allowedParams) {
    return _.pick(modelDescr, allowedParams)
  }
}

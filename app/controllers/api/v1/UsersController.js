import crypto from 'crypto';

import _ from 'lodash'
import compose from 'koa-compose';

import { dbAdapter, MyProfileSerializer, User, Group, AppTokenV1, SessionTokenV0 } from '../../../models'
import { NotFoundException, ForbiddenException, ValidationException, NotAuthorizedException } from '../../../support/exceptions'
import { EventService } from '../../../support/EventService'
import { load as configLoader } from '../../../../config/config'
import recaptchaVerify from '../../../../lib/recaptcha'
import { serializeUsersByIds } from '../../../serializers/v2/user';
import { authRequired, targetUserRequired, monitored } from '../../middlewares';
import { UsersControllerV2 } from '../../../controllers';
import { profileCache } from '../../../support/ExtAuth';


const config = configLoader()

export default class UsersController {
  static async create(ctx) {
    const params = {
      username: ctx.request.body.username,
      email:    ctx.request.body.email
    }

    let extProfileData = null;

    /**
     * The 'connectToExtProfile' parameter holds the key of profileCache.
     * If this parameter is present then the user is registered via the
     * external identity provider and must be linked to the external auth
     * profile. In this case the password will be randomly generated.
     */
    if (ctx.request.body.connectToExtProfile) {
      extProfileData = await profileCache.get(ctx.request.body.connectToExtProfile);

      // If the connectToExtProfile is defined then we should auto-generate password
      ctx.request.body.password = (await crypto.randomBytesAsync(8)).toString('base64');
      ctx.request.body.password_hash = undefined;
    }

    params.hashedPassword = ctx.request.body.password_hash

    if (!config.acceptHashedPasswordsOnly) {
      params.password = ctx.request.body.password
    }

    if (config.recaptcha.enabled) {
      const ip = ctx.request.get('x-forwarded-for') || ctx.request.ip;
      await recaptchaVerify(ctx.request.body.captcha, ip);
    }

    const invitationId = ctx.request.body.invitation;
    let invitation;

    if (invitationId) {
      invitation = await dbAdapter.getInvitation(invitationId);
      invitation = await validateInvitationAndSelectUsers(invitation, invitationId);
    }

    const user = new User(params)
    await user.create(false)

    try {
      if (extProfileData) {
        await user.addOrUpdateExtProfile(extProfileData);
      }

      const onboardingUser = await dbAdapter.getFeedOwnerByUsername(config.onboardingUsername)

      if (null === onboardingUser) {
        throw new NotFoundException(`Feed "${config.onboardingUsername}" is not found`)
      }

      await user.subscribeTo(onboardingUser)
    } catch (e /* if e instanceof NotFoundException */) {
      // if onboarding username is not found, just pass
    }

    const json = await new MyProfileSerializer(user).promiseToJSON()
    const authToken = new SessionTokenV0(user.id).tokenString();

    ctx.body = { ...json, authToken };
    AppTokenV1.addLogPayload(ctx, { userId: user.id });

    if (invitation) {
      await useInvitation(user, invitation, ctx.request.body.cancel_subscription);
    }
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

      await user.subscribeTo(onboardingUser)
    } catch (e /* if e instanceof NotFoundException */) {
      // if onboarding username is not found, just pass
    }

    const authToken = new SessionTokenV0(user.id).tokenString();

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
    await EventService.onSubscriptionRequestCreated(ctx.state.user.intId, user.intId);

    ctx.body = {};
  }

  static acceptRequest = compose([
    authRequired(),
    targetUserRequired(),
    async (ctx) => {
      const { user: targetUser, targetUser: subscriber } = ctx.state;

      const hasRequest = await dbAdapter.isSubscriptionRequestPresent(subscriber.id, targetUser.id)

      if (!hasRequest) {
        throw new ForbiddenException('There is no subscription requests');
      }

      await targetUser.acceptSubscriptionRequest(subscriber.id);
      await EventService.onSubscriptionRequestApproved(subscriber.intId, targetUser.intId);
      ctx.body = {};
    }
  ]);


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
    await EventService.onSubscriptionRequestRejected(user.intId, ctx.state.user.intId);
    ctx.body = {};
  }

  static show = compose([
    targetUserRequired(),
    monitored('users.show'),
    async (ctx) => {
      const { targetUser, user: viewer } = ctx.state;

      const [
        serUsers,
        acceptsDirects,
        pastUsernames,
      ] = await Promise.all([
        serializeUsersByIds([targetUser.id], true, viewer && viewer.id),
        targetUser.acceptsDirectsFrom(viewer),
        targetUser.getPastUsernames(),
      ]);

      const users = serUsers.find((u) => u.id === targetUser.id);
      const admins = serUsers.filter((u) => u.type === 'user');

      ctx.body = { users, admins, acceptsDirects, pastUsernames };
    },
  ]);

  static showMe = compose([
    authRequired(),
    monitored('users.show-me'),
    async (ctx) => {
      const { user } = ctx.state;

      const serUsers = await serializeUsersByIds([user.id]);
      const users = serUsers.find((u) => u.id === user.id);
      const admins = serUsers.filter((u) => u.type === 'user');

      ctx.body = { users, admins, acceptsDirects: false };
    },
  ]);

  static subscribers = compose([
    targetUserRequired(),
    monitored('users.subscribers'),
    async (ctx) => {
      const { user: viewer, targetUser: user } = ctx.state;

      if (!viewer && user.isPrivate === '1') {
        throw new ForbiddenException('User is private')
      }

      if (!viewer && user.isProtected === '1') {
        throw new ForbiddenException('User is protected')
      }

      const subscriberIds = await dbAdapter.getUserSubscribersIds(user.id);

      if (user.isPrivate === '1' && viewer.id !== user.id && !subscriberIds.includes(viewer.id)) {
        throw new ForbiddenException('User is private')
      }

      const serUsers = await serializeUsersByIds(subscriberIds, true, viewer && viewer.id);
      // Sorting by 'random' id to mask actual subscription order
      const subscribers = _.sortBy(serUsers, 'id');

      ctx.body = { subscribers };
    },
  ]);

  static subscriptions = compose([
    targetUserRequired(),
    monitored('users.subscriptions'),
    async (ctx) => {
      const { user: viewer, targetUser: user } = ctx.state;

      if (!viewer && user.isPrivate === '1') {
        throw new ForbiddenException('User is private')
      }

      if (!viewer && user.isProtected === '1') {
        throw new ForbiddenException('User is protected')
      }

      const subscriberIds = await dbAdapter.getUserSubscribersIds(user.id);

      if (user.isPrivate === '1' && viewer.id !== user.id && !subscriberIds.includes(viewer.id)) {
        throw new ForbiddenException('User is private')
      }

      let timelines = await dbAdapter.getTimelinesUserSubscribed(user.id);
      let timelineOwnersIds = timelines.map((t) => t.userId);

      // Leave only users and groups visible to viewer
      const groupsVisibility = await dbAdapter.getGroupsVisibility(timelineOwnersIds, viewer && viewer.id);
      timelineOwnersIds = timelineOwnersIds.filter((id) => groupsVisibility[id] !== false);
      timelines = timelines.filter(({ userId }) => groupsVisibility[userId] !== false);

      const serUsers = await serializeUsersByIds(timelineOwnersIds, false, viewer && viewer.id);
      // Sorting by 'random' id to mask actual subscription order
      const subscribers = _.sortBy(serUsers, 'id');
      const subscriptions = _.sortBy(timelines.map((t) => ({
        id:   t.id,
        name: t.name,
        user: t.userId,
      })), 'id');

      ctx.body = { subscribers, subscriptions };
    },
  ]);

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

  static subscribe = compose([
    authRequired(),
    targetUserRequired(),
    monitored('users.subscribe'),
    async (ctx) => {
      const { user: subscriber, targetUser } = ctx.state;

      if (subscriber.id === targetUser.id) {
        throw new ForbiddenException('You cannot subscribe to yourself');
      }

      if (targetUser.isPrivate === '1') {
        throw new ForbiddenException('You cannot subscribe to private feed');
      }

      const [
        banIds,
        theirBanIds,
      ] = await Promise.all([
        subscriber.getBanIds(),
        targetUser.getBanIds(),
      ]);

      if (banIds.includes(targetUser.id)) {
        throw new ForbiddenException('You cannot subscribe to a banned user');
      }

      if (theirBanIds.includes(subscriber.id)) {
        throw new ForbiddenException('This user prevented your from subscribing to them');
      }

      const success = await subscriber.subscribeTo(targetUser);

      if (!success) {
        throw new ForbiddenException('You are already subscribed to that user');
      }

      // should return the same response as 'whoami'
      await UsersControllerV2.whoAmI(ctx);
    },
  ]);

  static unsubscribeUser = compose([
    authRequired(),
    targetUserRequired(),
    monitored('users.unsubscribeUser'),
    async (ctx) => {
      const subscriber = ctx.state.user;

      const { username } = ctx.params;
      const targetUser = await dbAdapter.getFeedOwnerByUsername(username);

      if (!targetUser || !targetUser.isActive) {
        throw new NotFoundException(`User "${username}" is not found`);
      }

      const success = await targetUser.unsubscribeFrom(subscriber);

      if (!success) {
        throw new ForbiddenException('This user is not subscribed to you');
      }

      // should return the same response as 'whoami'
      await UsersControllerV2.whoAmI(ctx);
    },
  ]);

  static unsubscribe = compose([
    authRequired(),
    targetUserRequired(),
    monitored('users.unsubscribe'),
    async (ctx) => {
      const { user: subscriber, targetUser } = ctx.state;

      if (targetUser.isGroup()) {
        const adminIds = await targetUser.getAdministratorIds();

        if (adminIds.includes(subscriber.id)) {
          throw new ForbiddenException('Group administrators cannot unsubscribe from own groups');
        }
      }

      const success = await subscriber.unsubscribeFrom(targetUser);

      if (!success) {
        throw new ForbiddenException('You are not subscribed to that user');
      }

      // should return the same response as 'whoami'
      await UsersControllerV2.whoAmI(ctx);
    },
  ]);

  static update = compose([
    authRequired(),
    monitored('users.update'),
    async (ctx) => {
      const { state: { user, authToken }, request: { body }, params } = ctx;

      if (params.userId !== user.id) {
        throw new NotAuthorizedException();
      }

      const attrNames = [
        'screenName',
        'isPrivate',
        'isProtected',
        'description',
        'frontendPreferences',
        'preferences',
      ];

      // Only full access tokens can change email
      if (authToken.hasFullAccess()) {
        attrNames.push('email');
      }

      const attrs = attrNames.reduce((acc, key) => {
        if (key in body.user) {
          acc[key] = ctx.request.body.user[key];
        }

        return acc;
      }, {});

      await user.update(attrs);

      // should return the same response as 'whoami'
      await UsersControllerV2.whoAmI(ctx);
    },
  ]);

  static async updatePassword(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Not found' };
      return
    }

    const currentPassword = ctx.request.body.currentPassword || ''
    const valid = await ctx.state.user.validPassword(currentPassword)

    if (!valid) {
      throw new Error('Your old password is not valid');
    }

    await ctx.state.user.updatePassword(ctx.request.body.password, ctx.request.body.passwordConfirmation)
    ctx.body = { message: 'Your password has been changed' };
  }

  static async updateProfilePicture(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Not found' };
      return
    }

    const fileHandlerPromises = Object.values(ctx.request.files).map(async (file) => {
      await ctx.state.user.updateProfilePicture(file)
      ctx.body = { message: 'Your profile picture has been updated' };
    });

    await Promise.all(fileHandlerPromises);
  }
}

async function validateInvitationAndSelectUsers(invitation, invitationId) {
  if (!invitation) {
    throw new NotFoundException(`Invitation "${invitationId}" not found`);
  }

  if (invitation.registrations_count > 0 && invitation.single_use) {
    throw new ValidationException(`Somebody has already used invitation "${invitationId}"`);
  }


  const userNames = invitation.recommendations.users || [];
  const groupNames = invitation.recommendations.groups || [];

  const users = await dbAdapter.getFeedOwnersByUsernames(userNames);
  const publicUsers = [];
  const privateUsers = [];

  for (const user of users) {
    if (!(user instanceof User)) {
      throw new ValidationException(`User not found "${user.username}"`);
    }

    if (user.isPrivate === '1') {
      privateUsers.push(user);
    } else {
      publicUsers.push(user);
    }
  }

  const groups = await dbAdapter.getFeedOwnersByUsernames(groupNames);
  const publicGroups = [];
  const privateGroups = [];

  for (const group of groups) {
    if (!(group instanceof Group)) {
      throw new ValidationException(`Group not found "${group.username}"`);
    }

    if (group.isPrivate === '1') {
      privateGroups.push(group);
    } else {
      publicGroups.push(group);
    }
  }

  return { ...invitation, publicUsers, privateUsers, publicGroups, privateGroups };
}

async function useInvitation(newUser, invitation, cancel_subscription = false) {
  await dbAdapter.useInvitation(invitation.secure_id);
  await EventService.onInvitationUsed(invitation.author, newUser.intId);

  if (cancel_subscription) {
    return;
  }

  await Promise.all(invitation.publicUsers.map((recommendedUser) => {
    return newUser.subscribeTo(recommendedUser);
  }));

  await Promise.all(invitation.publicGroups.map((recommendedGroup) => {
    return newUser.subscribeTo(recommendedGroup);
  }));

  await Promise.all(invitation.privateUsers.map(async (recommendedUser) => {
    await newUser.sendSubscriptionRequest(recommendedUser.id);
    return EventService.onSubscriptionRequestCreated(newUser.intId, recommendedUser.intId);
  }));

  await Promise.all(invitation.privateGroups.map(async (recommendedGroup) => {
    await newUser.sendPrivateGroupSubscriptionRequest(recommendedGroup.id);
    return EventService.onGroupSubscriptionRequestCreated(newUser.intId, recommendedGroup);
  }));
}

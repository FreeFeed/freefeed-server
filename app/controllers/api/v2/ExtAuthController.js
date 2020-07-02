import { pick } from 'lodash';
import compose from 'koa-compose';

import { authRequired, inputSchemaRequired } from '../../middlewares';
import {
  NotFoundException,
  BadRequestException,
  NotAuthorizedException,
  ForbiddenException,
} from '../../../support/exceptions';
import {
  getAuthProvider,
  MODE_CONNECT,
  MODE_SIGN_IN,
  AuthError,
  SIGN_IN_SUCCESS,
  SIGN_IN_USER_EXISTS,
  SIGN_IN_CONTINUE,
  profileCache,
} from '../../../support/ExtAuth';
import { User, dbAdapter } from '../../../models';
import { SessionTokenV0 } from '../../../models/auth-tokens';
import { serializeUser } from '../../../serializers/v2/user';

import { authStartInputSchema, authFinishInputSchema } from './data-schemes/ext-auth';


export const listProfiles = compose([
  authRequired(),
  async (ctx) => {
    const profiles = await ctx.state.user.getExtProfiles();
    ctx.body = { profiles: profiles.map(serializeExtProfile) };
  },
]);

export const removeProfile = compose([
  authRequired(),
  async (ctx) => {
    const result = await ctx.state.user.removeExtProfile(ctx.params.profileId);

    if (!result) {
      throw new NotFoundException('Profile not found');
    }

    ctx.body = {};
  },
]);

export const authStart = compose([
  inputSchemaRequired(authStartInputSchema),
  async (ctx) => {
    const { provider: provName } = ctx.request.body;
    const authProvider = getAuthProvider(provName);

    if (!authProvider) {
      throw new NotFoundException(`Provider '${provName}' is not supported`);
    }

    const redirectTo = await authProvider.getAuthorizeURL(ctx.request.body);
    ctx.body = { redirectTo };
  },
]);

export const authFinish = compose([
  inputSchemaRequired(authFinishInputSchema),
  async (ctx) => {
    const { provider: provName } = ctx.request.body;
    const authProvider = getAuthProvider(provName);

    if (!authProvider) {
      throw new NotFoundException(`Provider '${provName}' is not supported`);
    }


    try {
      const state = await authProvider.acceptResponse(ctx.request.body);

      const profileData = {
        provider:   provName,
        externalId: state.profile.id,
        title:      state.profile.fullName,
      };

      // Connect external profile to FreeFeed account
      if (state.params.mode === MODE_CONNECT) {
        const currentUser = ctx.state.user;

        if (!currentUser) {
          throw new NotAuthorizedException();
        }

        const profileUser = await User.getByExtProfile(profileData);

        if (profileUser && profileUser.id !== currentUser.id) {
          throw new ForbiddenException(
            `The '${state.profile.fullName}' profile on ${authProvider.title} is already ` +
          `associated with another FreeFeed account: @${profileUser.username}`
          );
        }

        const profile = await currentUser.addOrUpdateExtProfile(profileData);
        ctx.body = { profile: serializeExtProfile(profile) };
      }

      // Sign in or start to sign up.
      if (state.params.mode === MODE_SIGN_IN) {
        const profile = {
          provider:   provName,
          name:       state.profile.fullName,
          email:      state.profile.email,
          pictureURL: state.profile.pictureURL,
        }

        const profileUser = await User.getByExtProfile(profileData);

        if (profileUser) {
          if (!profileUser.isActive) {
            throw new ForbiddenException('Your account is not active');
          }

          // User found, signing in
          const authToken =  new SessionTokenV0(profileUser.id).tokenString()
          ctx.body = {
            status:  SIGN_IN_SUCCESS,
            message: `Successfully signed in`,
            profile,
            user:    serializeUser(profileUser),
            authToken,
          };
          return;
        }

        const emailUser = state.profile.email && (await dbAdapter.getUserByEmail(state.profile.email));

        ctx.body = {
          status:  emailUser ? SIGN_IN_USER_EXISTS : SIGN_IN_CONTINUE,
          message: emailUser ?
            `Another user exists with this email address.` :
            `No user exists with this profile or email address. You can continue signing up.`,
          profile,
          suggestedUsername:  '',
          // Profile data to auto-connect after the user creation is complete.
          externalProfileKey: await profileCache.put(profileData),
        };

        // Trying to suggest a username
        {
          let username = '';

          if (state.profile.nickName) {
            username = state.profile.nickName.toLowerCase().replace(/[^a-z0-9]/gi, '');
          } else if (state.profile.email && state.profile.email.indexOf('@') !== -1) {
            username = state.profile.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/gi, '');
          }

          ctx.body.suggestedUsername = await adaptUsername(username);
        }
      }
    } catch (err) {
      if (err instanceof AuthError) {
        throw new BadRequestException(err.message);
      }

      throw err;
    } finally {
      await authProvider.done(ctx.request.body);
    }
  },
]);

/////////////////////

function serializeExtProfile(profile) {
  return pick(profile, [
    'id',
    'provider',
    'title',
    'createdAt',
  ]);
}

function isValidUsername(username) {
  return Reflect.apply(User.prototype.isValidUsername, { username }, [false]);
}

/**
 * Check if the username is already taken and if so add digits to the end of it.
 * Return empty string if can not adapt username.
 *
 * @param {string} username
 * @return {string}
 */
async function adaptUsername(username) {
  if (username.length < 3) {
    return '';
  }

  while (true) { // eslint-disable-line no-constant-condition
    if (isValidUsername(username)) {
      // eslint-disable-next-line no-await-in-loop
      const existingUser = await dbAdapter.getFeedOwnerByUsername(username);

      if (!existingUser) {
        break;
      }
    }

    let [, prefix, digits] = /^(.*?)([1-9]\d*)?$/.exec(username);
    digits = (Number.parseInt(digits || 0, 10) + 1).toString(10);

    if ((prefix + digits).length > 25) {
      prefix = prefix.substr(0, 25 - digits.length);
    }

    username = prefix + digits;
  }

  return username;
}

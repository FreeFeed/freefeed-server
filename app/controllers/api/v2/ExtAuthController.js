import { pick } from 'lodash';
import compose from 'koa-compose';

import { authRequired } from '../../middlewares';
import { NotFoundException } from '../../../support/exceptions';


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

function serializeExtProfile(profile) {
  return pick(profile, [
    'id',
    'provider',
    'title',
    'createdAt',
  ]);
}

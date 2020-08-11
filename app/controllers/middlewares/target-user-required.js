import { NotFoundException, ServerErrorException } from '../../support/exceptions';
import { dbAdapter } from '../../models';

/**
 * Checks existene of all users/groups mentioned in ctx.params
 *
 * @param {Object} mapping - mapping between the ctx.params keys (that contains
 * user/group names) and the the resulting ctx.state keys (that contains the
 * User/Group objects). The key of mapping is the ctx.params key and the value
 * is the resulting ctx.state. The default value { username: 'targetUser' }
 * means that user with name in the ctx.params['username'] will be present as
 * ctx.state['targetUser'].
 */
export function targetUserRequired(mapping = { username: 'targetUser' }) {
  return async (ctx, next) => {
    await Promise.all(Object.keys(mapping).map(async (key) => {
      if (!ctx.params[key]) {
        throw new ServerErrorException(`Server misconfiguration: the required parameter '${key}' is missing`);
      }

      const { [key]: username } = ctx.params;
      const targetUser = await dbAdapter.getFeedOwnerByUsername(username);

      if (!targetUser) {
        throw new NotFoundException(`User "${username}" is not found`);
      }

      ctx.state[mapping[key]] = targetUser;
    }));
    await next();
  };
}

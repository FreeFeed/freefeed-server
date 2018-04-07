import { NotFoundException, ServerErrorException } from '../../support/exceptions';
import { dbAdapter } from '../../models';

export function targetUserRequired(map = { username: 'targetUser' }) {
  return async (ctx, next) => {
    await Promise.all(Object.keys(map).map(async (key) => {
      if (!ctx.params[key]) {
        throw new ServerErrorException(`Server misconfiguration: the required parameter '${key}' is missing`);
      }
      const { [key]: username } = ctx.params;
      const targetUser = await dbAdapter.getFeedOwnerByUsername(username);
      if (!targetUser || !targetUser.isActive) {
        throw new NotFoundException(`User "${username}" is not found`);
      }
      ctx.state[map[key]] = targetUser;
    }));
    await next();
  };
}

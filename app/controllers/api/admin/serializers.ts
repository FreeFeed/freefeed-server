import { uniq } from 'lodash';

import { UUID } from '../../../support/types';
import { dbAdapter } from '../../../models';

export async function serializeUsers(userIds: UUID[]) {
  const users = (await dbAdapter.getUsersByIds(uniq(userIds))).filter((u) => u.isUser());
  userIds = users.map((u) => u.id);
  const [rolesAssoc, frozensUntil] = await Promise.all([
    dbAdapter.getUsersAdminRolesAssoc(userIds),
    dbAdapter.usersFrozenUntil(userIds),
  ]);
  return users.map((user, i) => ({
    id: user.id,
    username: user.username,
    screenName: user.screenName,
    profilePicture: user.profilePictureLargeUrl,
    goneStatus: user.goneStatusName,
    frozenUntil: frozensUntil[i],
    roles: rolesAssoc[user.id] ?? [],
  }));
}

export async function serializeUser(userId: UUID) {
  const sUsers = await serializeUsers([userId]);
  return sUsers[0];
}

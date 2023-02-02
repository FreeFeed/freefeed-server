import { uniq } from 'lodash';

import { UUID } from '../../../support/types';
import { dbAdapter } from '../../../models';

export async function serializeUsers(userIds: UUID[]) {
  const users = (await dbAdapter.getUsersByIds(uniq(userIds))).filter((u) => u.isUser());
  userIds = users.map((u) => u.id);
  const [rolesAssoc, frozensUntil, invitedByAssoc] = await Promise.all([
    dbAdapter.getUsersAdminRolesAssoc(userIds),
    dbAdapter.usersFrozenUntil(userIds),
    dbAdapter.getInvitedByAssoc(userIds),
  ]);
  return users.map((user, i) => ({
    id: user.id,
    username: user.username,
    screenName: user.screenName,
    profilePicture: user.profilePictureLargeUrl,
    createdAt: user.createdAt,
    goneStatus: user.goneStatusName,
    frozenUntil: frozensUntil[i],
    roles: rolesAssoc[user.id] ?? [],
    invitedBy: invitedByAssoc[user.id] ?? null,
  }));
}

export async function serializeUser(userId: UUID) {
  const sUsers = await serializeUsers([userId]);
  return sUsers[0];
}

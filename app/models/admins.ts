export const ROLE_ADMIN = 'administrator';
export const ROLE_MODERATOR = 'moderator';
export type AdminRole = typeof ROLE_ADMIN | typeof ROLE_MODERATOR;

export const ACT_GIVE_MODERATOR_RIGHTS = 'give_moderator_rights';
export const ACT_REMOVE_MODERATOR_RIGHTS = 'remove_moderator_rights';
export const ACT_FREEZE_USER = 'freeze_user';
export const ACT_UNFREEZE_USER = 'unfreeze_user';
export const ACT_SUSPEND_USER = 'suspend_user';
export const ACT_UNSUSPEND_USER = 'unsuspend_user';
export const ACT_DISABLE_INVITES_FOR_USER = 'disable_invites_for_user';
export const ACT_ENABLE_INVITES_FOR_USER = 'enable_invites_for_user';

export type AdminAction =
  | typeof ACT_GIVE_MODERATOR_RIGHTS
  | typeof ACT_REMOVE_MODERATOR_RIGHTS
  | typeof ACT_FREEZE_USER
  | typeof ACT_UNFREEZE_USER
  | typeof ACT_SUSPEND_USER
  | typeof ACT_UNSUSPEND_USER
  | typeof ACT_DISABLE_INVITES_FOR_USER
  | typeof ACT_ENABLE_INVITES_FOR_USER;

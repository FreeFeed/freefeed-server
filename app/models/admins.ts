export const ROLE_ADMIN = 'administrator';
export const ROLE_MODERATOR = 'moderator';
export type AdminRole = typeof ROLE_ADMIN | typeof ROLE_MODERATOR;

export const ACT_GIVE_MODERATOR_RIGHTS = 'give_moderator_rights';
export const ACT_REMOVE_MODERATOR_RIGHTS = 'remove_moderator_rights';
export type AdminAction = typeof ACT_GIVE_MODERATOR_RIGHTS | typeof ACT_REMOVE_MODERATOR_RIGHTS;

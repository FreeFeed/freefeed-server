import { dbAdapter } from '../models'

const EVENT_TYPES = {
  USER_BANNED:   'banned_user',
  USER_UNBANNED: 'unbanned_user',
  BANNED_BY:     'banned_by_user',
  UNBANNED_BY:   'unbanned_by_user'
};

export class EventService {
  static async onUserBanned(initiatorIntId, bannedUserIntId) {
    await dbAdapter.createEvent(initiatorIntId, EVENT_TYPES.USER_BANNED, initiatorIntId, bannedUserIntId);
    await dbAdapter.createEvent(bannedUserIntId, EVENT_TYPES.BANNED_BY, initiatorIntId, bannedUserIntId);
  }

  static async onUserUnbanned(initiatorIntId, unbannedUserIntId) {
    await dbAdapter.createEvent(initiatorIntId, EVENT_TYPES.USER_UNBANNED, initiatorIntId, unbannedUserIntId);
    await dbAdapter.createEvent(unbannedUserIntId, EVENT_TYPES.UNBANNED_BY, initiatorIntId, unbannedUserIntId);
  }
}

import { dbAdapter } from '../models'

const EVENT_TYPES = {
  USER_BANNED: 'banned_user',
  BANNED_BY:   'banned_by_user',
};

export class EventService {
  static async onUserBanned(initiatorIntId, bannedUserIntId) {
    await dbAdapter.createEvent(initiatorIntId, EVENT_TYPES.USER_BANNED, initiatorIntId, bannedUserIntId);
    await dbAdapter.createEvent(bannedUserIntId, EVENT_TYPES.BANNED_BY, initiatorIntId, bannedUserIntId);
  }
}

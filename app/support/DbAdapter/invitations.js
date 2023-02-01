import validator from 'validator';

import { DENIED, TOO_OFTEN, TOO_SOON } from '../../models/invitations';

///////////////////////////////////////////////////
// Invitations
///////////////////////////////////////////////////

const invitationsTrait = (superClass) =>
  class extends superClass {
    getInvitation(secureId) {
      if (!validator.isUUID(secureId)) {
        return null;
      }

      return this.database('invitations').first().where('secure_id', secureId);
    }

    getInvitationById(id) {
      return this.database.getRow('select * from invitations where id = :id', { id });
    }

    async createInvitation(authorIntId, message, lang, singleUse, userNames, groupNames) {
      const payload = {
        author: authorIntId,
        message,
        lang,
        single_use: singleUse,
        recommendations: {
          users: userNames,
          groups: groupNames,
        },
      };

      const res = await this.database('invitations').insert(payload).returning('secure_id');
      return res[0].secure_id;
    }

    async useInvitation(secureId) {
      await this.database.raw(
        'UPDATE invitations SET registrations_count = registrations_count + 1 where secure_id=?;',
        [secureId],
      );
    }

    /**
     * @typedef {import('../types').UUID} UUID
     * @typedef {import('../types/invitations').InvitationCreationCriterion} InvitationCreationCriterion
     * @typedef {import('../../models/invitations').RefusalReason} RefusalReason
     *
     * @param {UUID} userId
     * @param {InvitationCreationCriterion[]} criteria
     * @returns {Promise<RefusalReason | null>}
     */
    async canUserCreateInvitation(userId, criteria) {
      const [intId, invitesDisabled] = await Promise.all([
        this.database.getOne(`select id from users where uid = :userId`, { userId }),
        this.isInvitesDisabledForUser(userId),
      ]);

      if (invitesDisabled) {
        return DENIED;
      }

      const results = await Promise.all(
        criteria.map(async ([kind, args]) => {
          switch (kind) {
            case 'minAccountAge':
              return (await this.database.getOne(
                `select created_at > now() - :age::interval from users where uid = :userId`,
                { age: args.age, userId },
              ))
                ? TOO_SOON
                : null;
            case 'minPostsCreated':
              return (await this.database.getOne(
                `select not exists(
                            select 1 from posts where user_id = :userId limit 1 offset :count - 1
                         )`,
                { count: args.count, userId },
              ))
                ? TOO_SOON
                : null;
            case 'minCommentsFromOthers':
              return (await this.database.getOne(
                `select not exists(
                              select 1 from
                                comments c
                                join posts p on p.uid = c.post_id
                              where p.user_id = :userId and c.user_id <> :userId
                              limit 1 offset :count - 1
                           )`,
                { count: args.count, userId },
              ))
                ? TOO_SOON
                : null;
            case 'maxInvitesCreated':
              return (await this.database.getOne(
                `select exists(
                  select 1 from invitations where 
                    created_at > now() - :dur::interval and author = :intId
                    limit 1 offset :count - 1
               )`,
                { count: args.count, dur: args.interval, intId },
              ))
                ? TOO_OFTEN
                : null;
            default:
              return null;
          }
        }),
      );

      return results.find(Boolean) ?? null;
    }

    isInvitesDisabledForUser(userId) {
      return this.getUserSysPrefs(userId, 'invitesDisabled', false);
    }

    async setInvitesDisabledForUser(userId, isDisabled) {
      await this.setUserSysPrefs(userId, 'invitesDisabled', isDisabled);
    }

    async getInvitedByAssoc(userIds) {
      const rows = await this.database.getAll(
        `select u.uid, iu.username from
          users u
          join invitations inv on inv.id = u.invitation_id
          join users iu on inv.author = iu.id
          where u.uid = any(:userIds)`,
        { userIds },
      );
      const result = {};

      for (const { uid, username } of rows) {
        result[uid] = username;
      }

      return result;
    }
  };

export default invitationsTrait;

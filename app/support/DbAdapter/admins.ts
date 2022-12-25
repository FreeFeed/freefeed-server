import { type UUID } from '../types';

import { type DbAdapter } from './index';

const adminsTrait = (superClass: typeof DbAdapter) =>
  class extends superClass {
    async userIsAdmin(user_id: UUID): Promise<boolean> {
      const result = await this.database('administrators')
        .where({ user_id, is_admin: true })
        .count({ count: '*' })
        .first();

      return result == 1;
    }

    async userIsModerator(user_id: UUID): Promise<boolean> {
      const result = await this.database('administrators')
        .where(function () {
          this.where({ is_admin: true }).orWhere({ is_moderator: true });
        })
        .andWhere({ user_id })
        .count({ count: '*' })
        .first();

      return result == 1;
    }
  };

export default adminsTrait;

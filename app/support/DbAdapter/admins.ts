import { AdminRole, ROLE_ADMIN } from '../../models/admins';
import { type UUID } from '../types';

import { type DbAdapter } from './index';

const adminsTrait = (superClass: typeof DbAdapter) =>
  class extends superClass {
    getUserAdminRoles(userId: UUID): Promise<AdminRole[]> {
      return this.database.getCol(`select role from admin_users_roles where user_id = :userId`, {
        userId,
      });
    }

    async getUsersAdminRolesAssoc(userIds: UUID[]): Promise<{ [id: UUID]: AdminRole[] }> {
      const rows = await this.database.getAll<{ id: UUID; roles: AdminRole[] }>(
        `select user_id as id, array_agg(role) as roles 
          from admin_users_roles
          where user_id = any(:userIds)
          group by user_id`,
        { userIds },
      );

      const result: { [id: UUID]: AdminRole[] } = {};

      for (const row of rows) {
        result[row.id] = row.roles;
      }

      return result;
    }

    async setUserAdminRole(
      userId: UUID,
      role: AdminRole,
      doSet = true,
      { YES_I_WANT_TO_SET_ADMIN_FOR_TEST_ONLY = false } = {},
    ): Promise<void> {
      if (
        role === ROLE_ADMIN &&
        !(YES_I_WANT_TO_SET_ADMIN_FOR_TEST_ONLY && process.env.NODE_ENV === 'test')
      ) {
        throw new Error(`The '${ROLE_ADMIN}' role can only be set manually`);
      }

      if (doSet) {
        await this.database.raw(
          `insert into admin_users_roles (user_id, role) values (:userId, :role) on conflict do nothing`,
          { userId, role },
        );
      } else {
        await this.database.raw(
          `delete from admin_users_roles where (user_id, role) = (:userId, :role)`,
          { userId, role },
        );
      }
    }

    getUsersWithAdminRoles(): Promise<UUID[]> {
      return this.database.getCol(
        `select distinct user_id from admin_users_roles order by user_id`,
      );
    }
  };

export default adminsTrait;

import { AdminAction, AdminRole, ROLE_ADMIN } from '../../models/admins';
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
    ): Promise<boolean> {
      if (
        role === ROLE_ADMIN &&
        !(YES_I_WANT_TO_SET_ADMIN_FOR_TEST_ONLY && process.env.NODE_ENV === 'test')
      ) {
        throw new Error(`The '${ROLE_ADMIN}' role can only be set manually`);
      }

      if (doSet) {
        return !!(await this.database.getOne(
          `insert into admin_users_roles (user_id, role) values (:userId, :role)
            on conflict do nothing
            returning true`,
          { userId, role },
        ));
      }

      return !!(await this.database.getOne(
        `delete from admin_users_roles where (user_id, role) = (:userId, :role)
          returning true`,
        { userId, role },
      ));
    }

    getUsersWithAdminRoles(): Promise<UUID[]> {
      return this.database.getCol(
        `select distinct user_id from admin_users_roles order by user_id`,
      );
    }

    createAdminAction(
      action_name: AdminAction,
      admin_username: string,
      target_username: string | null,
      details: any,
    ): Promise<UUID> {
      return this.database.getOne(
        `insert into admin_actions 
        (
          action_name,
          admin_username,
          target_username,
          details
        ) values (
          :action_name,
          :admin_username,
          :target_username,
          :details
        ) returning id`,
        { action_name, admin_username, target_username, details },
      );
    }

    getAdminActions(
      limit = 30,
      offset = 0,
    ): Promise<
      {
        id: UUID;
        created_at: Date;
        action_name: AdminAction;
        admin_username: string;
        target_username: string | null;
        details: any;
      }[]
    > {
      return this.database.getAll(
        `select * from admin_actions order by created_at desc limit :limit offset :offset`,
        { limit, offset },
      );
    }
  };

export default adminsTrait;

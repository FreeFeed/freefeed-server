import { UUID } from '../types';

import { type DbAdapter } from './index';

export default function postCommentEventsTrait(superClass: typeof DbAdapter): typeof DbAdapter {
  return class extends superClass {
    async getCommentEventsStatusForPosts(
      viewerId: UUID | null,
      postIds: UUID[],
    ): Promise<Map<UUID, boolean>> {
      const result = new Map();

      if (!viewerId || postIds.length === 0) {
        return result;
      }

      const rows = await this.database.getAll(
        `select post_id, is_enabled from user_post_events
          where user_id = :viewerId and post_id = any(:postIds)`,
        { viewerId, postIds },
      );

      for (const row of rows) {
        result.set(row.post_id, row.is_enabled);
      }

      return result;
    }

    async getCommentEventsListenersForPost(postId: UUID): Promise<Map<UUID, boolean>> {
      const rows = await this.database.getAll(
        `select user_id, is_enabled from user_post_events where post_id = :postId`,
        { postId },
      );

      const result = new Map();

      for (const row of rows) {
        result.set(row.user_id, row.is_enabled);
      }

      return result;
    }

    async setCommentEventsStatusForPost(
      postId: UUID,
      userId: UUID,
      isEnabled: boolean,
    ): Promise<void> {
      await this.database.raw(
        `insert into user_post_events (user_id, post_id, is_enabled)
          values (:userId, :postId, :isEnabled)
          on conflict (user_id, post_id) do update set is_enabled = excluded.is_enabled`,
        { userId, postId, isEnabled },
      );
    }
  };
}

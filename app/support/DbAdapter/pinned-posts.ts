import pgFormat from 'pg-format';

import type { DbAdapter } from './index';

export default (superClass: typeof DbAdapter) =>
  class extends superClass {
    async pinUserPost(feedId: string, postId: string, pinnedBy: string) {
      // Record pin by the given feed (Posts of user or group) for this post and initiator
      await this.database('pinned_posts')
        .insert({ feed_id: feedId, post_id: postId, pinned_by: pinnedBy })
        .onConflict(['feed_id', 'post_id'])
        .ignore();
      return true;
    }

    async unpinUserPost(feedId: string, postId: string) {
      await this.database('pinned_posts').where({ feed_id: feedId, post_id: postId }).delete();
      return true;
    }

    async getPinnedDetailsByPosts(
      postIds: string[],
    ): Promise<Map<string, { userId: string; createdAt: string; pinnedBy: string }[]>> {
      if (postIds.length === 0) {
        return new Map();
      }

      const sql = pgFormat(
        `select pp.post_id, f.user_id, pp.created_at, pp.pinned_by
         from pinned_posts pp
         join feeds f on f.uid = pp.feed_id
         where pp.post_id in (%L)
         order by pp.created_at asc`,
        postIds,
      );
      const rows = await this.database.getAll<{
        post_id: string;
        user_id: string;
        created_at: string;
        pinned_by: string;
      }>(sql);
      const map = new Map<string, { userId: string; createdAt: string; pinnedBy: string }[]>();

      for (const r of rows) {
        if (!map.has(r.post_id)) {
          map.set(r.post_id, []);
        }

        map.get(r.post_id)?.push({
          userId: r.user_id,
          createdAt: new Date(r.created_at).toISOString(),
          pinnedBy: r.pinned_by,
        });
      }

      return map;
    }
  };

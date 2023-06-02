import { type UUID } from '../types';

import { sqlIntarrayIn } from './utils';

import { type DbAdapter } from './index';

const ZERO_UID = '00000000-00000000-00000000-00000000';

// All values are null (as "not available") for inactive accounts.
export type UserStats = {
  // Number of account's subscribers. It is null for accounts that are not
  // accessible for the current viewer (like not-public account viewed by
  // anonymous, or private account viewed by user that is not subscribed to it).
  subscribers: number | null;
  // Number of subscriptions of the account. It is null for groups and accounts
  // that are not accessible to the current viewer. Groups to which the viewer
  // has no access are also not counted in the total.
  subscriptions: number | null;
  // Number of account's posts. For groups, it is number of posts in the group feed. For users, it
  // is number of post written by user (excluding directs). Only posts that visible to the current
  // viewer are counted.
  posts: number | null;
  // Number of account's comments. For groups, it is always null. For users, it is number of
  // comments that visible to the current viewer.
  comments: number | null;
  // Number of account's likes. For groups, it is always null. For users, it is number of likes that
  // visible to the current viewer.
  likes: number | null;
};

export default (superClass: typeof DbAdapter) =>
  class extends superClass {
    async getDynamicUserStats(userId: UUID, viewerId: UUID | null): Promise<UserStats> {
      const [user, postsFeed, directsFeed, postsVisibilitySQL, notBannedActionsSQLFabric] =
        await Promise.all([
          this.getUserById(userId),
          this.getUserNamedFeed(userId, 'Posts'),
          this.getUserNamedFeed(userId, 'Directs'),
          this.postsVisibilitySQL(viewerId ?? undefined),
          this.notBannedActionsSQLFabric(viewerId ?? undefined),
        ]);
      const isViewerSubscribed =
        viewerId === userId ||
        (await this.isUserSubscribedToTimeline(viewerId ?? ZERO_UID, postsFeed?.id ?? ZERO_UID));

      if (!user?.isActive) {
        return {
          subscribers: null,
          subscriptions: null,
          posts: null,
          comments: null,
          likes: null,
        };
      }

      const getSubscribersCount = () => {
        if (
          (user.isProtected === '1' && !viewerId) ||
          (user.isPrivate === '1' && !isViewerSubscribed)
        ) {
          return null;
        }

        return this.database.getOne<number>(
          `select coalesce(count(*), 0)::int from
            subscriptions s
            join users u on s.user_id = u.uid
            where s.feed_id = :feedId`,
          { feedId: postsFeed?.id },
        );
      };

      const getSubscriptionsCount = async () => {
        if (user.isGroup()) {
          return null;
        }

        if (
          (user.isProtected === '1' && !viewerId) ||
          (user.isPrivate === '1' && !isViewerSubscribed)
        ) {
          return null;
        }

        const allFriends = await this.getUserFriendIds(user.id);
        const gVisibility = await this.getGroupsVisibility(allFriends, viewerId);

        // Count only groups visible to viewer
        return allFriends.reduce((acc, id) => (gVisibility[id] !== false ? acc + 1 : acc), 0);
      };

      const getPostsCount = () => {
        if (user.isGroup()) {
          // For group, count all visible posts in group feed
          return this.database.getOne<number>(
            `select coalesce(count(*), 0)::int from
              posts p
              join users u on p.user_id = u.uid
              where ${postsVisibilitySQL}
                and ${sqlIntarrayIn('p.destination_feed_ids', [postsFeed?.intId ?? 0])}`,
          );
        }

        // For user, count all visible posts written by user, excluding directs
        return this.database.getOne<number>(
          `select coalesce(count(*), 0)::int from
            posts p
            join users u on p.user_id = u.uid
            where ${postsVisibilitySQL}
              and p.user_id = :userId
              and not ${sqlIntarrayIn('p.destination_feed_ids', [directsFeed?.intId ?? 0])}`,
          { userId: user.id },
        );
      };

      const getCommentsCount = () => {
        if (user.isGroup()) {
          return null;
        }

        return this.database.getOne<number>(
          `select coalesce(count(*), 0)::int from
              comments c
              join posts p on c.post_id = p.uid
              join users u on p.user_id = u.uid
              where c.user_id = :userId 
                and ${postsVisibilitySQL}
                and ${notBannedActionsSQLFabric('c')}`,
          { userId },
        );
      };

      const getLikesCount = () => {
        if (user.isGroup()) {
          return null;
        }

        return this.database.getOne<number>(
          `select coalesce(count(*), 0)::int from
              likes l
              join posts p on l.post_id = p.uid
              join users u on p.user_id = u.uid
              where l.user_id = :userId 
                and ${postsVisibilitySQL}
                and ${notBannedActionsSQLFabric('l')}`,
          { userId },
        );
      };

      const [subscribers, subscriptions, posts, comments, likes] = await Promise.all([
        getSubscribersCount(),
        getSubscriptionsCount(),
        getPostsCount(),
        getCommentsCount(),
        getLikesCount(),
      ]);

      return { subscribers, subscriptions, posts, comments, likes };
    }
  };

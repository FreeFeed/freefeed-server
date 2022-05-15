import { GONE_DELETED } from '../models/user';

import { forEachAsync } from './forEachAsync';
import { UUID } from './types';
import { type DbAdapter } from './DbAdapter';

type Task = (dbAdapter: DbAdapter, userId: UUID, runUntil: Date) => Promise<void>;

// Objects to delete:
// 1. [x] User personal information
// 2. [x] Posts created by the user
// 3. [x] Likes created by the user
// 4. [x] Comment likes created by the user
// 5. [x] Bans of user
// 6. [x] Subscriptions of user
// 7. [x] Subscription requests from user
// 8. [x] Auxiliary home feeds of user
// 9. [x] Notifications caused by user activity
// 10. [x] App tokens of user (also app tokens logs)
// 11. [x] External auth profiles
// 12. [x] Archive restoration info
// 13. [x] Hidden (archived) comments and likes
// 14. [x] Invitations
// 15. [x] Local bumps
// 16. [x] sent_emails_log records
// 17. [x] Statistics (posts, likes, subscriptions = 0, update comments count)
// 18. [x] User's attachments

const setDeletedStatus: Task = async (dbAdapter, userId) => {
  const user = await dbAdapter.getUserById(userId);
  await user?.setGoneStatus(GONE_DELETED);
};

export const deletePersonalInfo: Task = async (dbAdapter, userId) => {
  const userRow = await dbAdapter.database.getRow(`select * from users where uid = ?`, userId);

  // Update all 'users' row fields to their default values except for some fields

  // This fields will not be modified
  const keepFields = ['id', 'uid', 'username', 'type', 'created_at', 'gone_status', 'gone_at'];

  // These fields will be set to specific values
  const updateFields = {
    screen_name: userRow.username,
    hashed_password: '',
  } as Record<string, unknown>;

  const payload = Object.keys(userRow)
    .filter((f) => !keepFields.includes(f))
    .reduce(
      (acc, field) => ({
        ...acc,
        [field]: updateFields[field] ?? dbAdapter.database.raw('DEFAULT'),
      }),
      {} as typeof updateFields,
    );

  await dbAdapter.database('users').where('uid', userId).update(payload);
};

export const deletePosts: Task = async (dbAdapter, userId, runUntil) => {
  const batchSize = 20;

  do {
    // eslint-disable-next-line no-await-in-loop
    const postIds = await dbAdapter.database.getCol<UUID>(
      `select uid from posts where user_id = :userId order by created_at limit :batchSize`,
      { userId, batchSize },
    );

    if (postIds.length === 0) {
      break;
    }

    // eslint-disable-next-line no-await-in-loop
    await forEachAsync(postIds, async (postId: UUID) => {
      const post = await dbAdapter.getPostById(postId);
      await post?.destroy();
    });
  } while (new Date() < runUntil);
};

export const deleteLikes: Task = async (dbAdapter, userId, runUntil) => {
  const batchSize = 50;
  const user = await dbAdapter.getUserById(userId);

  if (!user) {
    return;
  }

  do {
    // eslint-disable-next-line no-await-in-loop
    const postIds = await dbAdapter.database.getCol<UUID>(
      `select post_id from likes where user_id = :userId order by created_at limit :batchSize`,
      { userId, batchSize },
    );

    if (postIds.length === 0) {
      break;
    }

    // eslint-disable-next-line no-await-in-loop
    await forEachAsync(postIds, async (postId: UUID) => {
      const post = await dbAdapter.getPostById(postId);
      await post?.removeLike(user);
    });
  } while (new Date() < runUntil);
};

export const deleteCommentLikes: Task = async (dbAdapter, userId, runUntil) => {
  const batchSize = 50;
  const user = await dbAdapter.getUserById(userId);

  if (!user) {
    return;
  }

  do {
    // eslint-disable-next-line no-await-in-loop
    const commentIds = await dbAdapter.database.getCol<UUID>(
      `select c.uid from
        comment_likes l
        join comments c on c.id = l.comment_id
        where l.user_id = :userIntId 
        order by l.created_at limit :batchSize`,
      { userIntId: user.intId, batchSize },
    );

    if (commentIds.length === 0) {
      break;
    }

    // eslint-disable-next-line no-await-in-loop
    await forEachAsync(commentIds, async (commentId: UUID) => {
      const comment = await dbAdapter.getCommentById(commentId);
      await comment?.removeLike(user);
    });
  } while (new Date() < runUntil);
};

export const unbanAll: Task = async (dbAdapter, userId) => {
  const user = await dbAdapter.getUserById(userId);

  if (!user) {
    return;
  }

  // Suppose that bans count isn't a great number and we can process all bans at once
  const usernames = await dbAdapter.database.getCol<string>(
    `select u.username
      from
        bans b
        join users u on b.banned_user_id = u.uid
      where b.user_id = :userId 
      order by b.created_at`,
    { userId },
  );

  await forEachAsync(usernames, (username: string) => user?.unban(username));
};

export const deleteSubscriptions: Task = async (dbAdapter, userId, runUntil) => {
  const user = await dbAdapter.getUserById(userId);

  if (!user) {
    return;
  }

  const subscriptions = await user.getSubscriptionsWithHomeFeeds();
  const userIds = subscriptions.map((s) => s.user_id);

  await forEachAsync(userIds, async (id: UUID) => {
    if (new Date() < runUntil) {
      const friend = await dbAdapter.getUserById(id);
      friend && (await user.unsubscribeFrom(friend));
    }
  });
};

export const deleteSubscriptionRequests: Task = async (dbAdapter, userId) => {
  const toUserIds = await dbAdapter.getUserSubscriptionPendingRequestsIds(userId);

  await forEachAsync(toUserIds, (toUserId: UUID) =>
    dbAdapter.deleteSubscriptionRequest(toUserId, userId),
  );
};

export const deleteAuxHomeFeeds: Task = async (dbAdapter, userId) => {
  const user = await dbAdapter.getUserById(userId);

  if (user) {
    const homeFeeds = await user.getHomeFeeds();
    await forEachAsync(homeFeeds, (homeFeed) => homeFeed.destroy());
  }
};

export const deleteNotifications: Task = async (dbAdapter, userId) => {
  const user = await dbAdapter.getUserById(userId);

  // Remove user's notifications caused by the user themself
  user &&
    (await dbAdapter.database.raw(
      `delete from events where user_id = ? and created_by_user_id = user_id`,
      user.intId,
    ));
};

export const deleteAppTokens: Task = async (dbAdapter, userId, runUntil) => {
  const batchSize = 50;

  do {
    // eslint-disable-next-line no-await-in-loop
    const tokenIds = await dbAdapter.database.getCol<UUID>(
      `select uid from app_tokens where user_id = :userId order by created_at limit :batchSize`,
      { userId, batchSize },
    );

    if (tokenIds.length === 0) {
      break;
    }

    // eslint-disable-next-line no-await-in-loop
    await forEachAsync(tokenIds, async (tokenId) => {
      const token = await dbAdapter.getAppTokenById(tokenId);
      await token?.destroy();
    });
  } while (new Date() < runUntil);
};

export const deleteExtAuthProfiles: Task = async (dbAdapter, userId) => {
  const profiles = await dbAdapter.getExtProfiles(userId);
  await Promise.all(profiles.map((p: { id: UUID }) => dbAdapter.removeExtProfile(userId, p.id)));
};

export const deleteArchives: Task = async (dbAdapter, userId) => {
  await dbAdapter.database.raw(`delete from archives where user_id = ?`, userId);
  await dbAdapter.database.raw(`delete from hidden_comments where user_id = ?`, userId);
  await dbAdapter.database.raw(`delete from hidden_likes where user_id = ?`, userId);
};

export const deleteInvitations: Task = async (dbAdapter, userId) => {
  const user = await dbAdapter.getUserById(userId);
  user && (await dbAdapter.database.raw(`delete from invitations where author = ?`, user.intId));
};

export const deleteLocalBumps: Task = async (dbAdapter, userId) => {
  await dbAdapter.database.raw(`delete from local_bumps where user_id = ?`, userId);
};

export const deleteSentEmailsLog: Task = async (dbAdapter, userId) => {
  const user = await dbAdapter.getUserById(userId);
  user &&
    (await dbAdapter.database.raw(`delete from sent_emails_log where user_id = ?`, user.intId));
};

export const resetUserStatistics: Task = async (dbAdapter, userId) => {
  // We still have an unattached comments problem so we need to count only
  // comments of the real posts.
  const commentsCount = await dbAdapter.database.getOne<number>(
    `select count(*)::int from 
      comments c join posts p on c.post_id = p.uid
      where c.user_id = :userId`,
    { userId },
  );

  await dbAdapter.database.raw(
    `update user_stats set
      posts_count = 0,
      likes_count = 0,
      subscriptions_count = 0,
      comments_count = :commentsCount
      where user_id = :userId`,
    { userId, commentsCount },
  );
};

export const deleteAttachments: Task = async (dbAdapter, userId, runUntil) => {
  const batchSize = 20;

  do {
    // eslint-disable-next-line no-await-in-loop
    const attIds = await dbAdapter.database.getCol<UUID>(
      `select uid from attachments where user_id = :userId order by created_at limit :batchSize`,
      { userId, batchSize },
    );

    if (attIds.length === 0) {
      break;
    }

    // eslint-disable-next-line no-await-in-loop
    await forEachAsync(attIds, async (attId: UUID) => {
      const att = await dbAdapter.getAttachmentById(attId);
      await att?.destroy();
    });
  } while (new Date() < runUntil);
};

/**
 * Delete user data. User must be in GONE_DELETION status, when all data is
 * deleted the status becomes GONE_DELETED.
 */
export const deleteAllUserData: Task = combineTasks(
  deletePersonalInfo,
  deletePosts,
  deleteLikes,
  deleteCommentLikes,
  unbanAll,
  deleteSubscriptions,
  deleteSubscriptionRequests,
  deleteAuxHomeFeeds,
  deleteNotifications,
  deleteAppTokens,
  deleteExtAuthProfiles,
  deleteArchives,
  deleteInvitations,
  deleteLocalBumps,
  deleteSentEmailsLog,
  resetUserStatistics,
  deleteAttachments,
  // This ↓ must be the last task
  setDeletedStatus,
);

// Helpers

function combineTasks(...tasks: Task[]): Task {
  return (dbAdapter, userId, runUntil) =>
    forEachAsync(tasks, async (task: Task) => {
      if (new Date() < runUntil) {
        await task(dbAdapter, userId, runUntil);
      }
    });
}

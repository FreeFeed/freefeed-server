import createDebug from 'debug';

import { dbAdapter } from '../models';
import { GONE_DELETED } from '../models/user';

import { forEachAsync } from './forEachAsync';
import { delay } from './timers';
import { UUID } from './types';

const debug = createDebug('freefeed:user-gone');

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
// 19. [x] Subscriptions for individual posts comments

/**
 * Delete user data. User must be in GONE_DELETION status, when all data is
 * deleted the status becomes GONE_DELETED.
 */
export const deleteAllUserData = combineTasks(
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
  anonymizeInvitations,
  deleteLocalBumps,
  deleteSentEmailsLog,
  resetUserStatistics,
  deleteAttachments,
  deletePostCommentsSubscriptions,
  // This ↓ must be the last task
  setDeletedStatus,
);

const batchPauseMs = 500;

async function setDeletedStatus(userId: UUID) {
  const user = await dbAdapter.getUserById(userId);
  await user?.setGoneStatus(GONE_DELETED);
}

export async function deletePersonalInfo(userId: UUID) {
  const userRow = await dbAdapter.database.getRow(`select * from users where uid = ?`, userId);

  // Update all 'users' row fields to their default values except for some fields

  // This fields will not be modified
  const keepFields = [
    'id',
    'uid',
    'username',
    'type',
    'created_at',
    'gone_status',
    'gone_at',
    'invitation_id',
  ];

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
}

export async function deletePosts(userId: UUID, runUntil: Date) {
  const batchSize = 20;

  do {
    // eslint-disable-next-line no-await-in-loop
    const postIds = await dbAdapter.database.getCol<UUID>(
      `select uid from posts where user_id = :userId order by created_at limit :batchSize`,
      { userId, batchSize },
    );

    if (postIds.length === 0) {
      debug(`no posts to delete for ${userId}`);
      break;
    }

    debug(`found ${postIds.length} posts to delete for ${userId}`);

    // eslint-disable-next-line no-await-in-loop
    await forEachAsync(postIds, async (postId: UUID) => {
      const post = await dbAdapter.getPostById(postId);
      await post?.destroy();
    });

    // eslint-disable-next-line no-await-in-loop
    await delay(batchPauseMs);
  } while (new Date() < runUntil);
}

export async function deleteLikes(userId: UUID, runUntil: Date) {
  const batchSize = 100;
  const user = await dbAdapter.getUserById(userId);

  if (!user) {
    return;
  }

  const feedId = await user.getLikesTimelineIntId();

  do {
    // eslint-disable-next-line no-await-in-loop
    const postIds = await dbAdapter.database.getCol<UUID>(
      `select post_id from likes where user_id = :userId order by created_at limit :batchSize`,
      { userId, batchSize },
    );

    if (postIds.length === 0) {
      debug(`no likes to delete for ${userId}`);
      break;
    }

    debug(`found ${postIds.length} likes to delete for ${userId}`);

    // Fast likes deletion

    // eslint-disable-next-line no-await-in-loop
    await dbAdapter.database.raw(
      `delete from likes where user_id = :userId and post_id = any(:postIds)`,
      { userId, postIds },
    );

    if (feedId !== null) {
      // eslint-disable-next-line no-await-in-loop
      await dbAdapter.database.raw(
        `update posts set feed_ids  = (feed_ids - :feedId::int) WHERE uid = any(:postIds)`,
        { feedId, postIds },
      );
    }

    // eslint-disable-next-line no-await-in-loop
    await delay(batchPauseMs);
  } while (new Date() < runUntil);
}

export async function deleteCommentLikes(userId: UUID, runUntil: Date) {
  const batchSize = 100;

  const user = await dbAdapter.getUserById(userId);

  if (!user) {
    return;
  }

  do {
    // eslint-disable-next-line no-await-in-loop
    const commentIntIds = await dbAdapter.database.getCol<number>(
      `select comment_id from comment_likes where user_id = :userIntId order by created_at limit :batchSize`,
      { userIntId: user.intId, batchSize },
    );

    if (commentIntIds.length === 0) {
      debug(`no comment likes to delete for ${userId}`);
      break;
    }

    debug(`found ${commentIntIds.length} comment likes to delete for ${userId}`);

    // Fast comment likes deletion

    // eslint-disable-next-line no-await-in-loop
    await dbAdapter.database.raw(
      `delete from comment_likes where comment_id = any(:commentIntIds)`,
      { commentIntIds },
    );

    // eslint-disable-next-line no-await-in-loop
    await delay(batchPauseMs);
  } while (new Date() < runUntil);
}

export async function unbanAll(userId: UUID) {
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
}

export async function deleteSubscriptions(userId: UUID, runUntil: Date) {
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
}

export async function deleteSubscriptionRequests(userId: UUID) {
  const toUserIds = await dbAdapter.getUserSubscriptionPendingRequestsIds(userId);

  await forEachAsync(toUserIds, (toUserId: UUID) =>
    dbAdapter.deleteSubscriptionRequest(toUserId, userId),
  );
}

export async function deleteAuxHomeFeeds(userId: UUID) {
  const user = await dbAdapter.getUserById(userId);

  if (user) {
    const homeFeeds = await user.getHomeFeeds();
    await forEachAsync(homeFeeds, (homeFeed) => homeFeed.destroy());
  }
}

export async function deleteNotifications(userId: UUID) {
  const user = await dbAdapter.getUserById(userId);

  // Remove user's notifications caused by the user themself
  user &&
    (await dbAdapter.database.raw(
      `delete from events where user_id = ? and created_by_user_id = user_id`,
      user.intId,
    ));
}

export async function deleteAppTokens(userId: UUID, runUntil: Date) {
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

    // eslint-disable-next-line no-await-in-loop
    await delay(batchPauseMs);
  } while (new Date() < runUntil);
}

export async function deleteExtAuthProfiles(userId: UUID) {
  const profiles = await dbAdapter.getExtProfiles(userId);
  await Promise.all(profiles.map((p: { id: UUID }) => dbAdapter.removeExtProfile(userId, p.id)));
}

export async function deleteArchives(userId: UUID) {
  await dbAdapter.database.raw(`delete from archives where user_id = ?`, userId);
  await dbAdapter.database.raw(`delete from hidden_comments where user_id = ?`, userId);
  await dbAdapter.database.raw(`delete from hidden_likes where user_id = ?`, userId);
}

export async function anonymizeInvitations(userId: UUID) {
  const user = await dbAdapter.getUserById(userId);
  user &&
    (await dbAdapter.database.raw(
      `update invitations set
          message='',
          lang='en',
          recommendations='{}'
       where author = ?`,
      user.intId,
    ));
}

export async function deleteLocalBumps(userId: UUID) {
  await dbAdapter.database.raw(`delete from local_bumps where user_id = ?`, userId);
}

export async function deleteSentEmailsLog(userId: UUID) {
  const user = await dbAdapter.getUserById(userId);
  user &&
    (await dbAdapter.database.raw(`delete from sent_emails_log where user_id = ?`, user.intId));
}

export async function resetUserStatistics(userId: UUID) {
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
}

export async function deleteAttachments(userId: UUID, runUntil: Date) {
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

    // eslint-disable-next-line no-await-in-loop
    await delay(batchPauseMs);
  } while (new Date() < runUntil);
}

export async function deletePostCommentsSubscriptions(userId: UUID) {
  await dbAdapter.cleanCommentEventsSubscriptions(userId);
}

// Helpers

type Task = (userId: UUID, runUntil: Date) => Promise<void>;

function combineTasks(...tasks: Task[]): Task {
  return (userId: UUID, runUntil: Date) =>
    forEachAsync(tasks, async (task: Task) => {
      if (new Date() < runUntil) {
        debug(`starting ${task.name} for ${userId}`);

        try {
          await task(userId, runUntil);
          debug(`finished ${task.name} for ${userId}`);
        } catch (e) {
          debug(`failed ${task.name} for ${userId}: %o`, e);
          throw e;
        }
      }
    });
}

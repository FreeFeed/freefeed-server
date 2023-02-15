import { dbAdapter } from '../../models';
import { Nullable, UUID } from '../../support/types';
import type { EventRecord } from '../../support/DbAdapter';
import { EVENT_TYPES, HIDDEN_CREATOR_EVENT_TYPES } from '../../support/EventTypes';

import { serializeUsersByIds } from './user';

export async function serializeEvents(events: EventRecord[], viewerId: Nullable<UUID> = null) {
  const accountIntIds = new Set<Nullable<number>>();
  const postIntIds = new Set<Nullable<number>>();
  const commentIntIds = new Set<Nullable<number>>();

  for (const event of events) {
    if (
      HIDDEN_CREATOR_EVENT_TYPES.includes(event.event_type) &&
      event.user_id === event.target_user_id
    ) {
      event.created_by_user_id = null;
    }

    if (
      event.event_type === EVENT_TYPES.COMMENT_MODERATED &&
      event.created_by_user_id !== event.post_author_id &&
      event.user_id === event.target_user_id
    ) {
      event.created_by_user_id = null;
    }

    accountIntIds.add(event.user_id);
    accountIntIds.add(event.target_user_id);
    accountIntIds.add(event.created_by_user_id);
    accountIntIds.add(event.group_id);
    accountIntIds.add(event.post_author_id);
    postIntIds.add(event.post_id);
    commentIntIds.add(event.comment_id);
  }

  const [accountIdRows, postIdRows, commentIdRows] = await Promise.all([
    dbAdapter.getUsersIdsByIntIds([...accountIntIds].filter(Boolean) as number[]),
    dbAdapter.getPostsIdsByIntIds([...postIntIds].filter(Boolean) as number[]),
    dbAdapter.getCommentsIdsByIntIds([...commentIntIds].filter(Boolean) as number[]),
  ]);

  const accountId2UIDs = accountIdRows.reduce(
    (acc, row) => ({ ...acc, [row.id]: row.uid }),
    {},
  ) as {
    [k: number]: UUID;
  };

  const allPostIds = [
    ...postIdRows.map((r) => r.uid),
    ...events.map((e) => e.target_post_id).filter(Boolean),
  ] as UUID[];

  // Posts from non-suspended authors
  const activePostIds = await dbAdapter.filterSuspendedPosts(allPostIds);

  const serializedEvents = events.map((e) => {
    const s = {
      id: e.id,
      eventId: e.uid,
      date: e.created_at.toISOString(),
      recipient_user_id: (e.user_id && accountId2UIDs[e.user_id]) || null,
      created_user_id: (e.created_by_user_id && accountId2UIDs[e.created_by_user_id]) || null,
      affected_user_id: (e.target_user_id && accountId2UIDs[e.target_user_id]) || null,
      event_type: e.event_type,
      group_id: (e.group_id && accountId2UIDs[e.group_id]) || null,
      post_id: postIdRows.find((r) => r.id === e.post_id)?.uid || null,
      comment_id: commentIdRows.find((r) => r.id === e.comment_id)?.uid || null,
      post_author_id: (e.post_author_id && accountId2UIDs[e.post_author_id]) || null,
      target_post_id: e.target_post_id,
      target_comment_id: e.target_comment_id,
    };

    // Do not show posts from inactive authors
    if (s.post_id && !activePostIds.includes(s.post_id)) {
      s.post_id = null;
      s.comment_id = null;
      s.post_author_id = null;
    }

    if (s.target_post_id && !activePostIds.includes(s.target_post_id)) {
      s.target_post_id = null;
      s.target_comment_id = null;
    }

    return s;
  });

  // Now collecting user information for the output
  const accountIds = accountIdRows.map((r) => r.uid);
  const sAccounts = await serializeUsersByIds(accountIds, viewerId);

  return {
    events: serializedEvents,
    users: sAccounts.filter((u) => u.type === 'user'),
    groups: sAccounts.filter((u) => u.type === 'group'),
  };
}

import { dbAdapter } from '../../models';
import { EventRecord } from '../../support/DbAdapter';
import { Nullable, UUID } from '../../support/types';

import { userSerializerFunction } from './user';

export async function serializeEvents(events: EventRecord[], viewerId: Nullable<UUID> = null) {
  const accountIntIds = new Set<Nullable<number>>();
  const postIntIds = new Set<Nullable<number>>();
  const commentIntIds = new Set<Nullable<number>>();

  for (const event of events) {
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

  // Posts from non-suspended authors
  const activePostIds = await dbAdapter.filterSuspendedPosts(postIdRows.map((r) => r.uid));

  const serializedEvents = events.map((e) => {
    const s = {
      id: e.id,
      eventId: e.uid,
      date: e.created_at.toISOString(),
      created_user_id: (e.created_by_user_id && accountId2UIDs[e.created_by_user_id]) || null,
      affected_user_id: (e.target_user_id && accountId2UIDs[e.target_user_id]) || null,
      event_type: e.event_type,
      group_id: (e.group_id && accountId2UIDs[e.group_id]) || null,
      post_id: postIdRows.find((r) => r.id === e.post_id)?.uid || null,
      comment_id: commentIdRows.find((r) => r.id === e.comment_id)?.uid || null,
      post_author_id: (e.post_author_id && accountId2UIDs[e.post_author_id]) || null,
    };

    // Do not show posts from inactive authors
    if (s.post_id && !activePostIds.includes(s.post_id)) {
      s.post_id = null;
      s.comment_id = null;
      s.post_author_id = null;
    }

    return s;
  });

  // Now collecting user information for the output
  const accountIds = accountIdRows.map((r) => r.uid);
  const allGroupAdmins = await dbAdapter.getGroupsAdministratorsIds(accountIds, viewerId);
  Object.values(allGroupAdmins).forEach((ids) =>
    ids.forEach((s) => !accountIds.includes(s) && accountIds.push(s)),
  );

  const [allUsersAssoc, allStatsAssoc] = await Promise.all([
    dbAdapter.getUsersByIdsAssoc(accountIds),
    dbAdapter.getUsersStatsAssoc(accountIds),
  ]);

  const serializeUser = userSerializerFunction(allUsersAssoc, allStatsAssoc, allGroupAdmins);
  const accounts = Object.keys(allUsersAssoc).map(serializeUser);

  return {
    events: serializedEvents,
    users: accounts.filter((u) => u.type === 'user'),
    groups: accounts.filter((u) => u.type === 'group'),
  };
}

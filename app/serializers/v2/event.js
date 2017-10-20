import _ from 'lodash';
import { dbAdapter } from '../../models';
import { userSerializerFunction } from '../../controllers/api/v2/helpers';

export async function serializeEvents(events) {
  const [userIdsMapping, postIdsMapping, commentIdsMapping] = await getIntIdsMappings(events);

  const serializedEvents = events.map((e) => {
    return {
      id:               e.id,
      eventId:          e.uid,
      date:             e.created_at.toISOString(),
      created_user_id:  userIdsMapping[e.created_by_user_id] || null,
      affected_user_id: userIdsMapping[e.target_user_id] || null,
      event_type:       e.event_type,
      group_id:         userIdsMapping[e.group_id] || null,
      post_id:          postIdsMapping[e.post_id] || null,
      comment_id:       commentIdsMapping[e.comment_id] || null,
      post_author_id:   userIdsMapping[e.post_author_id] || null
    };
  });

  const allUserIds = new Set();
  _.values(userIdsMapping).forEach((id) => allUserIds.add(id));
  const allGroupAdmins = await dbAdapter.getGroupsAdministratorsIds([...allUserIds]);
  _.values(allGroupAdmins).forEach((ids) => ids.forEach((s) => allUserIds.add(s)));

  const [allUsersAssoc, allStatsAssoc] = await Promise.all([
    dbAdapter.getUsersByIdsAssoc([...allUserIds]),
    dbAdapter.getUsersStatsAssoc([...allUserIds]),
  ]);

  const serializeUser = userSerializerFunction(allUsersAssoc, allStatsAssoc, allGroupAdmins);
  const users = Object.keys(allUsersAssoc).map(serializeUser).filter((u) => u.type === 'user');
  const groups = Object.keys(allUsersAssoc).map(serializeUser).filter((u) => u.type === 'group');

  return {
    events: serializedEvents,
    users,
    groups
  };
}

async function getIntIdsMappings(events) {
  let usersIntIds = [];
  let postsIntIds = [];
  let commentsIntIds = [];
  for (const e of events) {
    usersIntIds.push(e.user_id, e.created_by_user_id, e.target_user_id, e.group_id, e.post_author_id);
    postsIntIds.push(e.post_id);
    commentsIntIds.push(e.comment_id);
  }
  usersIntIds = _(usersIntIds).compact().uniq().value();
  postsIntIds = _(postsIntIds).compact().uniq().value();
  commentsIntIds = _(commentsIntIds).compact().uniq().value();

  const [userIds, postIds, commentIds] = await Promise.all([
    dbAdapter.getUsersIdsByIntIds(usersIntIds),
    dbAdapter.getPostsIdsByIntIds(postsIntIds),
    dbAdapter.getCommentsIdsByIntIds(commentsIntIds)
  ]);
  const userIdsMapping = {};
  const postIdsMapping = {};
  const commentIdsMapping = {};
  for (const el of userIds) {
    userIdsMapping[el.id] = el.uid;
  }
  for (const el of postIds) {
    postIdsMapping[el.id] = el.uid;
  }
  for (const el of commentIds) {
    commentIdsMapping[el.id] = el.uid;
  }
  return [userIdsMapping, postIdsMapping, commentIdsMapping];
}

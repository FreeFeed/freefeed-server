import { reduce, uniqBy, pick, map, keyBy, compact, uniq } from 'lodash';

import { PostSerializer, dbAdapter } from '../../models';

import { userSerializerFunction } from './user';


export const serializePostsCollection = async (postsObjects, viewerUUID = null) => {
  const postsCollection = await Promise.all(postsObjects.map((post) => new PostSerializer(post).promiseToJSON()));
  const postsCollectionJson = {
    posts:         [],
    comments:      [],
    attachments:   [],
    subscriptions: [],
    admins:        [],
    users:         [],
    subscribers:   []
  };

  const transformPosts = (result, val) => {
    result.posts.push(val.posts);

    result.comments       = uniqBy(result.comments.concat(val.comments || []), 'id');
    result.attachments    = uniqBy(result.attachments.concat(val.attachments || []), 'id');
    result.subscriptions  = uniqBy(result.subscriptions.concat(val.subscriptions || []), 'id');
    result.admins         = uniqBy(result.admins.concat(val.admins || []), 'id');
    result.users          = uniqBy(result.users.concat(val.users || []), 'id');
    result.subscribers    = uniqBy(result.subscribers.concat(val.subscribers || []), 'id');

    return result;
  };

  let postsPayload = reduce(postsCollection, transformPosts, postsCollectionJson);
  postsPayload = await _insertCommentLikesInfo(postsPayload, viewerUUID);
  return postsPayload;
};

export function serializePost(post) {
  return {
    ...pick(post, [
      'id',
      'body',
      'commentsDisabled',
      'createdAt',
      'updatedAt',
      'friendfeedUrl',
      'commentLikes',
      'ownCommentLikes',
      'omittedCommentLikes',
      'omittedOwnCommentLikes'
    ]),
    createdBy: post.userId,
  };
}

export function serializeComment(comment) {
  return {
    ...pick(comment, [
      'id',
      'body',
      'createdAt',
      'updatedAt',
      'hideType',
      'likes',
      'hasOwnLike'
    ]),
    createdBy: comment.userId,
  };
}

export function serializeAttachment(att) {
  const result = {
    ...pick(att, [
      'id',
      'fileName',
      'fileSize',
      'url',
      'thumbnailUrl',
      'imageSizes',
      'mediaType',
      'createdAt',
      'updatedAt',
      ...(att.mediaType === 'audio' ? ['artist', 'title'] : [])
    ]),
    createdBy: att.userId,
  };
  return result;
}

async function _insertCommentLikesInfo(postsPayload, viewerUUID) {
  const postIds = map(postsPayload.posts, 'id');
  const commentIds = map(postsPayload.comments, 'id');
  const [commentLikesData, postCommentLikesData] = await Promise.all([
    dbAdapter.getLikesInfoForComments(commentIds, viewerUUID),
    dbAdapter.getLikesInfoForPosts(postIds, viewerUUID)
  ]);

  const commentLikes = keyBy(commentLikesData, 'uid');
  const postCommentLikes = keyBy(postCommentLikesData, 'uid');

  postsPayload.comments = map(postsPayload.comments, (comment) => {
    let [likesCount, hasOwnLike] = [0, false];
    const likeInfo = commentLikes[comment.id];

    if (likeInfo) {
      likesCount = parseInt(likeInfo.c_likes);
      hasOwnLike = likeInfo.has_own_like;
    }

    comment.likes = likesCount;
    comment.hasOwnLike = hasOwnLike;
    return comment;
  });

  postsPayload.posts = _modifyPostsPayload(postsPayload.posts, postCommentLikes, commentLikes);

  return postsPayload;
}

function _modifyPostsPayload(postsPayload, postCLikesDict, commentLikesDict) {
  return map(postsPayload, (post) => {
    let [allLikes, ownLikes, omittedLikes, omittedOwn] = [0, 0, 0, 0];
    const commentLikesForPost = postCLikesDict[post.id];

    if (commentLikesForPost) {
      allLikes = parseInt(commentLikesForPost.post_c_likes_count);
      ownLikes = parseInt(commentLikesForPost.own_c_likes_count);

      if (allLikes > 0) {
        omittedLikes = allLikes;
        omittedOwn = ownLikes;

        for (const commentId of post.comments) {
          const likeInfo = commentLikesDict[commentId];

          if (likeInfo) {
            omittedLikes -= parseInt(likeInfo.c_likes);
            omittedOwn -= likeInfo.has_own_like * 1;
          }
        }
      }
    }

    return {
      ...post,
      commentLikes:           allLikes,
      ownCommentLikes:        ownLikes,
      omittedCommentLikes:    omittedLikes,
      omittedOwnCommentLikes: omittedOwn
    };
  });
}

/**
 * Serialize posts (probably from timeline)
 * and return fully prepared result for API response.
 *
 * @param {string[]} postIds
 * @param {string|null} viewerId
 * @param {Timeline|null} timeline
 * @param {object} params
 */
export async function serializeFeed(
  postIds,
  viewerId,
  timeline = null,
  { isLastPage = false } = {}
) {
  const canViewTimeline = timeline ? await timeline.canShow(viewerId) : true;

  let hiddenCommentTypes = [];

  if (viewerId) {
    const viewer = await dbAdapter.getUserById(viewerId)
    hiddenCommentTypes = viewer.getHiddenCommentTypes();
  }

  const allUserIds = new Set();
  const allPosts = [];
  const allComments = [];
  const allAttachments = [];
  const allDestinations = [];
  const allSubscribers = [];

  const [hidesFeedId, savesFeedId] = viewerId ? await dbAdapter.getUserNamedFeedsIntIds(viewerId, ['Hides', 'Saves']) : [0, 0];

  const postsWithStuff = await dbAdapter.getPostsWithStuffByIds(postIds, viewerId, { hiddenCommentTypes });

  for (const { post, destinations, attachments, comments, likes, omittedComments, omittedLikes } of postsWithStuff) {
    const sPost = {
      ...serializePost(post),
      postedTo:    destinations.map((d) => d.id),
      comments:    comments.map((c) => c.id),
      attachments: attachments.map((a) => a.id),
      likes,
      omittedComments,
      omittedLikes,
    };

    if (post.feedIntIds.includes(hidesFeedId)) {
      sPost.isHidden = true; // present only if true
    }

    if (post.feedIntIds.includes(savesFeedId)) {
      sPost.isSaved = true; // present only if true
    }

    allPosts.push(sPost);
    allDestinations.push(...destinations);
    allSubscribers.push(...destinations.map((d) => d.user));
    allComments.push(...comments.map(serializeComment));
    allAttachments.push(...attachments.map(serializeAttachment));

    allUserIds.add(sPost.createdBy);
    likes.forEach((l) => allUserIds.add(l));
    comments.forEach((c) => allUserIds.add(c.userId));
    destinations.forEach((d) => allUserIds.add(d.user));
  }

  let timelines = null;

  if (timeline) {
    timelines = {
      id:    timeline.id,
      name:  timeline.name,
      user:  timeline.userId,
      posts: postIds,
    };
    timelines.subscribers = canViewTimeline ? await dbAdapter.getTimelineSubscribersIds(timeline.id) : [];
    allSubscribers.push(timeline.userId);
    allSubscribers.push(...timelines.subscribers);
  }

  allSubscribers.forEach((s) => allUserIds.add(s));

  const allGroupAdmins = canViewTimeline ? await dbAdapter.getGroupsAdministratorsIds([...allUserIds], viewerId) : {};
  Object.values(allGroupAdmins).forEach((ids) => ids.forEach((s) => allUserIds.add(s)));

  const [
    allUsersAssoc,
    allStatsAssoc,
  ] = await Promise.all([
    dbAdapter.getUsersByIdsAssoc([...allUserIds]),
    dbAdapter.getUsersStatsAssoc([...allUserIds]),
  ]);

  const uniqSubscribers = compact(uniq(allSubscribers));

  const serializeUser = userSerializerFunction(allUsersAssoc, allStatsAssoc, allGroupAdmins);

  const users = Object.keys(allUsersAssoc).map(serializeUser).filter((u) => u.type === 'user' || (timeline && u.id === timeline.userId));
  const subscribers = canViewTimeline ? uniqSubscribers.map(serializeUser) : [];

  const subscriptions = canViewTimeline ? uniqBy(compact(allDestinations), 'id') : [];

  const admins = (timeline && canViewTimeline) ? (allGroupAdmins[timeline.userId] || []).map(serializeUser) : [];

  return {
    timelines,
    users,
    subscriptions,
    subscribers,
    admins,
    isLastPage,
    posts:       allPosts,
    comments:    compact(allComments),
    attachments: compact(allAttachments),
  };
}

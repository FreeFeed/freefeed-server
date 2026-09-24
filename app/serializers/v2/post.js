import { uniqBy, pick, compact, uniq } from 'lodash-es';

import { dbAdapter } from '../../models';
import { TIMELINE_VISIBILITY_FULL } from '../../models/constants';

import { serializeUsersByIds } from './user';
import { serializeAttachment } from './attachment';

export function serializeComment(comment) {
  return {
    ...pick(comment, [
      'id',
      'shortId',
      'body',
      'createdAt',
      'updatedAt',
      'hideType',
      'likes',
      'hasOwnLike',
      'seqNumber',
      'postId',
    ]),
    createdBy: comment.userId,
  };
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
  { isLastPage = false, foldComments = true, foldLikes = true, apiVersion } = {},
) {
  const visibilityLevel = timeline
    ? await timeline.getVisibilityLevel(viewerId)
    : TIMELINE_VISIBILITY_FULL;

  // Private account timeline doesn't expose its meta info:
  // - subscribers
  // - admins (for groups)
  const canSeeMeta = visibilityLevel === TIMELINE_VISIBILITY_FULL;

  const viewer = viewerId ? await dbAdapter.getUserById(viewerId) : null;

  const hiddenCommentTypes = viewer?.getHiddenCommentTypes() ?? [];

  // All users that are mentioned in posts, comments, and anything else
  const allUserIds = new Set();
  // All serialized posts
  const allPosts = [];
  // All serialized comments
  const allComments = [];
  // All serialized attachments
  const allAttachments = [];
  // All post destination feeds (it becomes 'subscriptions' in the response)
  const allDestinations = [];
  // All subscribers (UIDs). Includes UIDs of:
  // - post destination feeds owners
  // - this timeline (if any) owner
  // - this timeline (if any) subscribers
  const allSubscribers = [];

  const [hidesFeedId, savesFeedId] = viewerId
    ? await dbAdapter.getUserNamedFeedsIntIds(viewerId, ['Hides', 'Saves'])
    : [0, 0];

  const postsWithStuff = await dbAdapter.getPostsWithStuffByIds(postIds, viewerId, {
    hiddenCommentTypes,
    foldComments,
    foldLikes,
    apiVersion,
  });

  const { notifyOfCommentsOnMyPosts = false, notifyOfCommentsOnCommentedPosts = false } =
    viewer?.preferences ?? {};
  const [commentEventsStatus, articleIdsByPostId, pinDetailsMap] = await Promise.all([
    dbAdapter.getCommentEventsStatusForPosts(viewerId, postIds),
    dbAdapter.getArticleIdsByPostIds(postIds),
    dbAdapter.getPinnedDetailsByPosts(postIds),
  ]);

  let commentedPostIds = [];

  if (notifyOfCommentsOnCommentedPosts) {
    const feedIntId = await viewer.getCommentsTimelineIntId();
    commentedPostIds = await dbAdapter.getPostsPresentsInTimeline(postIds, feedIntId);
  }

  for (const {
    post,
    destinations,
    attachments,
    comments,
    likes,
    omittedComments,
    omittedCommentsOffset,
    omittedLikes,
    backlinksCount,
  } of postsWithStuff.filter(Boolean)) {
    const sPost = {
      ...serializePostData(post),
      postedTo: destinations.map((d) => d.id),
      comments: comments.map((c) => c.id),
      attachments: attachments.map((a) => a.id),
      likes,
      omittedComments,
      omittedCommentsOffset,
      omittedLikes,
      backlinksCount,
      notifyOfAllComments: false,
      articleId: articleIdsByPostId.get(post.id) ?? null,
    };

    if (post.feedIntIds.includes(hidesFeedId)) {
      sPost.isHidden = true; // present only if true
    }

    if (post.feedIntIds.includes(savesFeedId)) {
      sPost.isSaved = true; // present only if true
    }

    if (commentEventsStatus.has(post.id)) {
      sPost.notifyOfAllComments = commentEventsStatus.get(post.id);
    } else if (destinations.some((d) => d.name === 'Directs' && d.user === viewerId)) {
      sPost.notifyOfAllComments = true;
    } else if (notifyOfCommentsOnMyPosts && post.userId === viewerId) {
      sPost.notifyOfAllComments = true;
    } else if (commentedPostIds.includes(post.id)) {
      sPost.notifyOfAllComments = true;
    }

    if (pinDetailsMap.has(post.id)) {
      sPost.pinnedIn = pinDetailsMap.get(post.id).map((d) => ({
        targetId: d.userId,
        pinnedAt: d.createdAt,
      }));

      for (const p of sPost.pinnedIn) {
        allUserIds.add(p.ownerId);
      }
    }

    allPosts.push(sPost);
    allDestinations.push(...destinations);
    allSubscribers.push(...destinations.map((d) => d.user));
    allComments.push(...comments.map((c) => serializeComment(c, viewerId)));
    allAttachments.push(...attachments.map((a) => serializeAttachment(a, apiVersion)));

    allUserIds.add(sPost.createdBy);
    likes.forEach((l) => allUserIds.add(l));
    comments.forEach((c) => allUserIds.add(c.userId));
    destinations.forEach((d) => allUserIds.add(d.user));
  }

  let timelines = null;

  if (timeline) {
    timelines = {
      id: timeline.id,
      name: timeline.name,
      user: timeline.userId,
      posts: postIds,
      subscribers: [],
    };

    if (canSeeMeta) {
      timelines.subscribers = await dbAdapter.getTimelineSubscribersIds(timeline.id);
      allSubscribers.push(timeline.userId);
    } else {
      allUserIds.add(timeline.userId);
    }

    allSubscribers.push(...timelines.subscribers);
  }

  allSubscribers.forEach((s) => allUserIds.add(s));

  const sAccounts = await serializeUsersByIds(compact([...allUserIds]), viewerId);
  const sAccountsMap = new Map(sAccounts.map((a) => [a.id, a]));

  const users = sAccounts.filter(
    (u) => u.type === 'user' || (timeline && u.id === timeline.userId),
  );

  const subscriptions = uniqBy(compact(allDestinations), 'id');
  const subscribers = compact(uniq(allSubscribers)).map((id) => sAccountsMap.get(id));
  const admins =
    // Only fully visible timelines expose admins
    timeline && canSeeMeta
      ? (sAccountsMap.get(timeline.userId)?.administrators || []).map((id) => sAccountsMap.get(id))
      : [];

  return {
    timelines,
    users,
    subscriptions,
    subscribers,
    admins,
    isLastPage,
    posts: allPosts,
    comments: compact(allComments),
    attachments: compact(allAttachments),
  };
}

/**
 * Serialize single post and return fully prepared result for API response.
 *
 * @param {string} postId
 * @param {string|null} viewerId
 * @param {object} params
 */
export async function serializeSinglePost(
  postId,
  viewerId = null,
  { foldComments = true, foldLikes = true, apiVersion } = {},
) {
  const data = await serializeFeed([postId], viewerId, null, {
    foldComments,
    foldLikes,
    apiVersion,
  });
  [data.posts] = data.posts;
  Reflect.deleteProperty(data, 'timelines');
  Reflect.deleteProperty(data, 'admins');
  Reflect.deleteProperty(data, 'isLastPage');
  return data;
}

/* Internals */

function serializePostData(post) {
  return {
    ...pick(post, [
      'id',
      'shortId',
      'body',
      'commentsDisabled',
      'createdAt',
      'updatedAt',
      'friendfeedUrl',
      'commentLikes',
      'ownCommentLikes',
      'omittedCommentLikes',
      'omittedOwnCommentLikes',
      'pinnedIn',
    ]),
    createdBy: post.userId,
  };
}

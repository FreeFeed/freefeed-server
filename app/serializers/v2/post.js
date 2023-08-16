import { uniqBy, pick, compact, uniq } from 'lodash';

import { dbAdapter } from '../../models';
import { currentConfig } from '../../support/app-async-context';

import { serializeUsersByIds } from './user';

export function serializeComment(comment) {
  return {
    ...pick(comment, [
      'id',
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

export function serializeLike(user) {
  return { users: pick(user, ['id', 'username', 'screenName']) };
}

export function serializeAttachment(att) {
  const config = currentConfig();
  const { useImgProxy } = config.attachments;
  const imageSizes = { ...att.imageSizes };
  let { thumbnailUrl } = att;

  // Compatibility hack: we use JPEG previews for WebP originals, so we need to
  // update preview paths when ImgProxy is in use.
  if (useImgProxy && att.mediaType === 'image' && /\.webp$/.test(att.url)) {
    for (const sizeId of Object.keys(imageSizes)) {
      imageSizes[sizeId].url = imageSizes[sizeId].url.replace(/\.jpg$/, '.webp?format=jpg');
    }

    thumbnailUrl = thumbnailUrl.replace(/\.jpg$/, '.webp?format=jpg');
  }

  const result = {
    ...pick(att, [
      'id',
      'fileName',
      'fileSize',
      'url',
      'mediaType',
      'createdAt',
      'updatedAt',
      ...(att.mediaType === 'audio' ? ['artist', 'title'] : []),
    ]),
    imageSizes,
    thumbnailUrl,
    createdBy: att.userId,
    postId: att.postId || null,
  };
  return result;
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
  { isLastPage = false, foldComments = true, foldLikes = true } = {},
) {
  const canViewTimeline = timeline ? await timeline.canShow(viewerId) : true;

  let hiddenCommentTypes = [];

  if (viewerId) {
    const viewer = await dbAdapter.getUserById(viewerId);
    hiddenCommentTypes = viewer.getHiddenCommentTypes();
  }

  const allUserIds = new Set();
  const allPosts = [];
  const allComments = [];
  const allAttachments = [];
  const allDestinations = [];
  const allSubscribers = [];

  const [hidesFeedId, savesFeedId] = viewerId
    ? await dbAdapter.getUserNamedFeedsIntIds(viewerId, ['Hides', 'Saves'])
    : [0, 0];

  const postsWithStuff = await dbAdapter.getPostsWithStuffByIds(postIds, viewerId, {
    hiddenCommentTypes,
    foldComments,
    foldLikes,
  });

  for (const {
    post,
    destinations,
    attachments,
    comments,
    likes,
    omittedComments,
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
      omittedLikes,
      backlinksCount,
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
    allComments.push(...comments.map((c) => serializeComment(c, viewerId)));
    allAttachments.push(...attachments.map(serializeAttachment));

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
    };
    timelines.subscribers = canViewTimeline
      ? await dbAdapter.getTimelineSubscribersIds(timeline.id)
      : [];
    allSubscribers.push(timeline.userId);
    allSubscribers.push(...timelines.subscribers);
  }

  allSubscribers.forEach((s) => allUserIds.add(s));

  const sAccounts = await serializeUsersByIds(compact([...allUserIds]), viewerId);
  const sAccountsMap = new Map(sAccounts.map((a) => [a.id, a]));

  const users = sAccounts.filter(
    (u) => u.type === 'user' || (timeline && u.id === timeline.userId),
  );

  const subscriptions = canViewTimeline ? uniqBy(compact(allDestinations), 'id') : [];
  const subscribers = canViewTimeline
    ? compact(uniq(allSubscribers)).map((id) => sAccountsMap.get(id))
    : [];
  const admins =
    timeline && canViewTimeline
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
  { foldComments = true, foldLikes = true } = {},
) {
  const data = await serializeFeed([postId], viewerId, null, { foldComments, foldLikes });
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
    ]),
    createdBy: post.userId,
  };
}

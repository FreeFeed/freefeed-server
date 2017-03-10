import { reduce, uniqBy, pick, map } from 'lodash';
import { PostSerializer, dbAdapter } from '../../models';

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
  const [commentLikes, postCommentLikesInfo] = await Promise.all([
    dbAdapter.getLikesInfoForComments(commentIds, viewerUUID),
    dbAdapter.getLikesInfoForPosts(postIds, viewerUUID)
  ]);

  for (const post of postsPayload.posts) {
    post.commentLikes = 0;
    post.ownCommentLikes = 0;
    post.omittedCommentLikes = 0;
    post.omittedOwnCommentLikes = 0;
    const commentLikesForPost = postCommentLikesInfo.find((el) => el.uid === post.id);
    if (commentLikesForPost) {
      post.commentLikes = parseInt(commentLikesForPost.post_c_likes_count);
      post.ownCommentLikes = parseInt(commentLikesForPost.own_c_likes_count);
      if (post.commentLikes > 0) {
        post.omittedCommentLikes = post.commentLikes;
        post.omittedOwnCommentLikes = post.ownCommentLikes;

        for (const commentId of post.comments) {
          const likeInfo = commentLikes.find((el) => el.uid === commentId);
          if (likeInfo) {
            post.omittedCommentLikes -= parseInt(likeInfo.c_likes);
            post.omittedOwnCommentLikes -= likeInfo.has_own_like ? 1 : 0;
          }
        }
      }
    }
  }

  for (const comment of postsPayload.comments) {
    let [likesCount, hasOwnLike] = [0, false];
    const likeInfo = commentLikes.find((el) => el.uid === comment.id);

    if (likeInfo) {
      likesCount = parseInt(likeInfo.c_likes);
      hasOwnLike = likeInfo.has_own_like;
    }
    comment.likes = likesCount;
    comment.hasOwnLike = hasOwnLike;
  }
  return postsPayload;
}

import config from 'config';
import _, { difference } from 'lodash';
import compose from 'koa-compose';

import { dbAdapter } from '../../../models';
import { serializeSinglePost, serializeFeed } from '../../../serializers/v2/post';
import {
  authRequired,
  inputSchemaRequired,
  monitored,
  postAccessRequired,
} from '../../middlewares';
import { ForbiddenException } from '../../../support/exceptions';

import { getPostsByIdsInputSchema, notifyOfAllCommentsInputSchema } from './data-schemes/posts';
import { getCommonParams } from './TimelinesController';

export const show = compose([
  postAccessRequired(true),
  monitored('posts.show-v2'),
  async (ctx) => {
    const { user: viewer, post } = ctx.state;

    const foldComments = ctx.request.query.maxComments !== 'all';
    const foldLikes = ctx.request.query.maxLikes !== 'all';

    ctx.body = await serializeSinglePost(post.id, viewer && viewer.id, { foldComments, foldLikes });
  },
]);

export const opengraph = compose([
  monitored('posts.opengraph-v2'),
  async (ctx) => {
    let { postId } = ctx.params;

    if (postId && postId.length < 36) {
      postId = (await dbAdapter.getPostLongId(postId)) ?? postId;
    }

    const post = await dbAdapter.getPostById(postId);

    // OpenGraph is available for public posts that are not protected
    if (!post || post.isProtected === '1') {
      ctx.body = '';
      return;
    }

    const author = await dbAdapter.getUserById(post.userId);

    if (!author.isActive) {
      ctx.body = '';
      return;
    }

    let image = null;
    let image_h, image_w;

    // The first image attachment is used
    const attachments = await dbAdapter.getAttachmentsOfPost(post.id);

    if (attachments.length > 0) {
      for (const item of attachments) {
        if (item.mediaType === 'image') {
          let image_size;

          // Image fallback: thumbnail 2 (t2) => thumbnail (t) => original (o) => none
          // Posts created in older versions of FreeFeed had only one thumbnail (t)
          if (`t2` in item.imageSizes) {
            image_size = `t2`; // Use high-res thumbnail
            image = item.imageSizes[image_size].url;
          } else if (`t` in item.imageSizes) {
            image_size = `t`; // Use thumbnail
            image = item.thumbnailUrl;
          } else if (`o` in item.imageSizes) {
            image_size = `o`; // Use original image if there are no thumbnails present
            image = item.url;
          } else {
            break;
          }

          image_h = item.imageSizes[image_size].h;
          image_w = item.imageSizes[image_size].w;
          break;
        }
      }
    }

    const body = _.escape(post.body);

    let og = `<meta property="og:title" content="${author.username} at ${config.siteTitle}" />
      <meta property="og:description" content="${body}" />
      <meta property="og:type" content="article" />`;

    if (image) {
      og += `
        <meta property="og:image" content="${image}" />
        <meta property="og:image:width" content="${image_w}" />
        <meta property="og:image:height" content="${image_h}" />`;
    }

    ctx.body = og;
  },
]);

const maxPostsByIds = 100;

export const getByIds = compose([
  inputSchemaRequired(getPostsByIdsInputSchema),
  monitored('posts.by-ids'),
  async (ctx) => {
    const { user: viewer } = ctx.state;
    const { postIds } = ctx.request.body;

    const hasMore = postIds.length > maxPostsByIds;

    if (hasMore) {
      postIds.length = maxPostsByIds;
    }

    const foldComments = ctx.request.query.maxComments !== 'all';
    const foldLikes = ctx.request.query.maxLikes !== 'all';

    const visiblePostIds = await dbAdapter.selectPostsVisibleByUser(postIds, viewer?.id);

    ctx.body = await serializeFeed(visiblePostIds, viewer?.id, null, { foldComments, foldLikes });
    const postsFound = ctx.body.posts.map((p) => p.id);
    const postsNotFound = difference(postIds, postsFound);
    ctx.body.postsNotFound = postsNotFound;
    delete ctx.body.isLastPage;
    delete ctx.body.timelines;
  },
]);

export const leave = compose([
  authRequired(),
  postAccessRequired(),
  async (ctx) => {
    const { user, post } = ctx.state;

    const ok = await post.removeDirectRecipient(user);

    if (!ok) {
      throw new ForbiddenException('You can not leave this post');
    }

    ctx.body = {};
  },
]);

/**
 * Returns feed of posts that reference the given post
 */
export const getReferringPosts = compose([
  monitored('posts.referring'),
  postAccessRequired(true),
  async (ctx) => {
    const { post, user } = ctx.state;

    const params = getCommonParams(ctx);
    params.limit++;

    const foundPostsIds = await dbAdapter.getReferringPosts(post.id, user?.id, params);
    const isLastPage = foundPostsIds.length <= params.limit - 1;

    if (!isLastPage) {
      foundPostsIds.length = params.limit - 1;
    }

    ctx.body = await serializeFeed(foundPostsIds, user?.id, null, { isLastPage });
  },
]);

export const notifyOfAllComments = compose([
  monitored('posts.notifyOfAllComments'),
  postAccessRequired(),
  inputSchemaRequired(notifyOfAllCommentsInputSchema),
  async (ctx) => {
    const { post, user } = ctx.state;
    const { enabled } = ctx.request.body;

    await dbAdapter.setCommentEventsStatusForPost(post.id, user.id, enabled);
    ctx.body = await serializeSinglePost(post.id, user.id);
  },
]);

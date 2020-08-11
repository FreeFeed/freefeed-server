import _ from 'lodash';
import compose from 'koa-compose';

import { dbAdapter } from '../../../models';
import { serializeSinglePost } from '../../../serializers/v2/post';
import { monitored, postAccessRequired } from '../../middlewares';


export const show = compose([
  postAccessRequired(),
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
    const post = await dbAdapter.getPostById(ctx.params.postId);

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
            image_size = `t`;  // Use thumbnail
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

    let og = `<meta property="og:title" content="FreeFeed.net/${author.username}" />
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

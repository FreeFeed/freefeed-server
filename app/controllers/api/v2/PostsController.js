import _ from 'lodash';
import { dbAdapter } from '../../../models';
import { NotFoundException, ForbiddenException } from '../../../support/exceptions';
import { serializePost, serializeComment, serializeAttachment } from '../../../serializers/v2/post';
import { monitored, userSerializerFunction } from './helpers';

export default class PostsController {
  /**
   * Viewer CAN NOT see post if:
   * - viwer is anonymous and post is not public or
   * - viewer is authorized and
   *   - post author banned viewer or was banned by viewer or
   *   - post is private and viewer cannot read any of post's destination feeds
   */
  show = monitored('posts.show-v2', async (ctx) => {
    const
      viewer = ctx.state.user,
      post = await dbAdapter.getPostById(ctx.params.postId),
      forbidden = (reason = 'You cannot see this post') => new ForbiddenException(reason);

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    // Check if viwer is anonymous and post is not public
    if (!viewer && post.isProtected === '1') {
      if (post.isPrivate === '0') {
        // Only return 'forbidden' for the protected post and anonymous viewer
        // In all other cases return 'not found'
        throw forbidden('Please sign in to view this post');
      } else {
        throw forbidden();
      }
    }

    if (viewer) {
      // Check if post author banned viewer or was banned by viewer
      const bannedUserIds = await dbAdapter.getBansAndBannersOfUser(viewer.id);
      if (bannedUserIds.includes(post.userId)) {
        throw forbidden();
      }

      // Check if post is private and viewer cannot read any of post's destination feeds
      if (post.isPrivate === '1') {
        const privateFeedIds = await dbAdapter.getVisiblePrivateFeedIntIds(viewer.id);
        if (_.isEmpty(_.intersection(post.destinationFeedIds, privateFeedIds))) {
          throw forbidden();
        }
      }
    }

    const foldComments = ctx.request.query.maxComments !== 'all';
    const foldLikes = ctx.request.query.maxLikes !== 'all';
    const hiddenCommentTypes = viewer ? viewer.getHiddenCommentTypes() : [];

    const [postWithStuff] = await dbAdapter.getPostsWithStuffByIds(
      [post.id],
      viewer ? viewer.id : null,
      { foldComments, foldLikes, hiddenCommentTypes },
    );

    // The following code is mostly copied from ./TimelinesControlloer.js

    const allUserIds = new Set();

    const sPost = {
      ...serializePost(postWithStuff.post),
      postedTo:        _.map(postWithStuff.destinations, 'id'),
      comments:        _.map(postWithStuff.comments, 'id'),
      attachments:     _.map(postWithStuff.attachments, 'id'),
      likes:           postWithStuff.likes,
      omittedComments: postWithStuff.omittedComments,
      omittedLikes:    postWithStuff.omittedLikes,
    };

    const comments = postWithStuff.comments.map(serializeComment);
    const attachments = postWithStuff.attachments.map(serializeAttachment);
    const subscribersIds = _.compact(_.map(postWithStuff.destinations, 'user'));

    allUserIds.add(sPost.createdBy);
    postWithStuff.likes.forEach((l) => allUserIds.add(l));
    postWithStuff.comments.forEach((c) => allUserIds.add(c.userId));
    postWithStuff.destinations.forEach((d) => allUserIds.add(d.user));

    const allGroupAdmins = await dbAdapter.getGroupsAdministratorsIds([...allUserIds]);
    _.values(allGroupAdmins).forEach((ids) => ids.forEach((s) => allUserIds.add(s)));

    const [
      allUsersAssoc,
      allStatsAssoc,
    ] = await Promise.all([
      dbAdapter.getUsersByIdsAssoc([...allUserIds]),
      dbAdapter.getUsersStatsAssoc([...allUserIds]),
    ]);

    const serializeUser = userSerializerFunction(allUsersAssoc, allStatsAssoc, allGroupAdmins);

    const users = Object.keys(allUsersAssoc).map(serializeUser).filter((u) => u.type === 'user');
    const subscribers = subscribersIds.map(serializeUser);

    const subscriptions = _.uniqBy(_.compact(postWithStuff.destinations), 'id');

    ctx.body = {
      posts: sPost,
      users,
      subscriptions,
      subscribers,
      comments,
      attachments,
    };
  });

  opengraph = monitored('posts.opengraph-v2', async (ctx) => {
    const post = await dbAdapter.getPostById(ctx.params.postId);

    // OpenGraph is available for public posts that are not protected
    if (!post || post.isPrivate === '1' || post.isProtected === '1') {
      ctx.body = '';
      return;
    }

    let image = null;
    let image_h, image_w;

    // The first image attachment is used
    const attachments = await dbAdapter.getAttachmentsOfPost(post.id);

    if (attachments.length > 0) {
      for (const item of attachments.map(serializeAttachment)) {
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

    const author = await dbAdapter.getUserById(post.userId);
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
  });
}

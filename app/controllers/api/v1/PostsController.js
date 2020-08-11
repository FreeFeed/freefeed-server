import _ from 'lodash'
import monitor from 'monitor-dog';
import compose from 'koa-compose';

import { dbAdapter, Post, AppTokenV1 } from '../../../models'
import { ForbiddenException, NotFoundException, BadRequestException } from '../../../support/exceptions'
import { postAccessRequired, authRequired, monitored, inputSchemaRequired } from '../../middlewares';
import { show as showPost } from '../v2/PostsController';

import { postCreateInputSchema, postUpdateInputSchema } from './data-schemes';


export default class PostsController {
  static create = compose([
    authRequired(),
    inputSchemaRequired(postCreateInputSchema),
    monitored('posts.create'),
    async (ctx) => {
      const { user: author } = ctx.state;
      const {
        meta: { commentsDisabled, feeds },
        post: { body, attachments }
      } = ctx.request.body;

      const destNames = (typeof feeds === 'string') ? [feeds] : feeds;
      const timelineIds = await checkDestNames(destNames, author);

      const newPost = new Post({
        userId:           author.id,
        body,
        attachments,
        commentsDisabled: commentsDisabled ? '1' : '0',
        timelineIds,
      });

      try {
        await newPost.create();
      } catch (e) {
        throw new BadRequestException(`Can not create post: ${e.message}`);
      }

      ctx.params.postId = newPost.id;
      AppTokenV1.addLogPayload(ctx, { postId: newPost.id });

      await showPost(ctx);
    },
  ]);

  static update = compose([
    authRequired(),
    postAccessRequired(),
    inputSchemaRequired(postUpdateInputSchema),
    monitored('posts.update'),
    async (ctx) => {
      const { user, post } = ctx.state;

      if (post.userId != user.id) {
        throw new ForbiddenException("You can't update another user's post")
      }

      const { body, attachments, feeds } = ctx.request.body.post;

      let { destinationFeedIds } = post;

      if (feeds) {
        const destUids = await checkDestNames(feeds, user);
        const [destFeeds, isDirect] = await Promise.all([
          dbAdapter.getTimelinesByIds(destUids),
          post.isStrictlyDirect(),
        ]);

        destinationFeedIds = destFeeds.map((f) => f.intId);

        if (isDirect) {
          if (!destFeeds[0].isDirects()) {
            throw new ForbiddenException('You can not update direct post to regular one');
          }

          if (_.difference(post.destinationFeedIds, destinationFeedIds).length != 0) {
            throw new ForbiddenException('You can not remove any receivers from direct post');
          }
        } else if (destFeeds[0].isDirects()) {
          throw new ForbiddenException('You can not update regular post to direct one');
        }
      }

      if (attachments) {
        const attObjects = await dbAdapter.getAttachmentsByIds(attachments);

        if (attObjects.some((a) => a.userId !== user.id)) {
          throw new ForbiddenException('You can not use attachments created by other user');
        }

        if (attObjects.some((a) => a.postId && a.postId !== post.id)) {
          throw new ForbiddenException('You can not use attachments from another post');
        }
      }

      try {
        await post.update({ body, attachments, destinationFeedIds })
      } catch (e) {
        throw new BadRequestException(`Can not create post: ${e.message}`);
      }

      await showPost(ctx);
    },
  ]);

  static like = compose([
    authRequired(),
    postAccessRequired(),
    monitored('posts.likes'),
    async (ctx) => {
      const { user, post } = ctx.state;

      if (post.userId === user.id) {
        throw new ForbiddenException("You can't like your own post");
      }

      const success = await post.addLike(user);

      if (!success) {
        throw new ForbiddenException("You can't like post that you have already liked");
      }

      monitor.increment('posts.reactions');
      ctx.body = {};
    },
  ]);

  static unlike = compose([
    authRequired(),
    postAccessRequired(),
    monitored('posts.unlikes'),
    async (ctx) => {
      const { user, post } = ctx.state;
      const success = await post.removeLike(user);

      if (!success) {
        throw new ForbiddenException("You can't un-like post that you haven't yet liked");
      }

      monitor.decrement('posts.reactions');
      ctx.body = {};
    },
  ]);

  static destroy = compose([
    authRequired(),
    postAccessRequired(),
    async (ctx) => {
      const { user, post } = ctx.state;

      if (!await post.isAuthorOrGroupAdmin(user)) {
        throw new ForbiddenException("You can't delete another user's post")
      }

      let postStillAvailable = false;

      // Post's author deletes post
      if (post.userId === user.id) {
        await post.destroy()
        monitor.increment('posts.destroys');
        ctx.body = { postStillAvailable };
        return;
      }

      // Group admin deletes post
      const [
        postDestinations,
        userManagedGroups,
      ] = await Promise.all([
        post.getPostedTo(),
        user.getManagedGroups(),
      ]);
      const groupsPostsFeeds = await Promise.all(
        userManagedGroups.map((g) => dbAdapter.getUserNamedFeed(g.id, 'Posts'))
      );

      const feedsToRemain = _.differenceBy(postDestinations, groupsPostsFeeds, 'id');

      if (feedsToRemain.length === 0) {
        // No feeds left, deleting post
        await post.destroy(user)
        monitor.increment('posts.destroys');
        ctx.body = { postStillAvailable };
        return;
      }

      // Partial removal: remove post only from several feeds
      await post.update({
        destinationFeedIds: _.map(feedsToRemain, 'intId'),
        updatedBy:          user,
      });

      postStillAvailable = await (await dbAdapter.getPostById(post.id)).isVisibleFor(user);

      ctx.body = { postStillAvailable };
    },
  ]);

  static hide = compose([
    authRequired(),
    postAccessRequired(),
    async (ctx) => {
      const { user, post } = ctx.state;

      await post.hide(user.id)
      ctx.body = {};
    },
  ]);

  static unhide = compose([
    authRequired(),
    postAccessRequired(),
    async (ctx) => {
      const { user, post } = ctx.state;

      await post.unhide(user.id)
      ctx.body = {};
    },
  ]);

  static save = compose([
    authRequired(),
    postAccessRequired(),
    async (ctx) => {
      const { user, post } = ctx.state;

      await post.save(user.id);
      ctx.body = {};
    },
  ]);

  static unsave = compose([
    authRequired(),
    postAccessRequired(),
    async (ctx) => {
      const { user, post } = ctx.state;

      await post.unsave(user.id);
      ctx.body = {};
    },
  ]);

  static disableComments = compose([
    authRequired(),
    postAccessRequired(),
    async (ctx) => {
      const { user, post } = ctx.state;

      if (!await post.isAuthorOrGroupAdmin(user)) {
        throw new ForbiddenException("You can't disable comments for another user's post");
      }

      await post.setCommentsDisabled('1');
      ctx.body = {};
    },
  ]);

  static enableComments = compose([
    authRequired(),
    postAccessRequired(),
    async (ctx) => {
      const { user, post } = ctx.state;

      if (!await post.isAuthorOrGroupAdmin(user)) {
        throw new ForbiddenException("You can't enable comments for another user's post");
      }

      await post.setCommentsDisabled('0');
      ctx.body = {};
    },
  ]);
}

/**
 * Check post destination names against the given post author
 * and return ids of destination timelines on success. Throws
 * HTTP errors if any error happens.
 *
 * @param {string[]} destNames
 * @param {User} author
 * @returns {string[]}
 */
export async function checkDestNames(destNames, author) {
  destNames = _.uniq(destNames.map((u) => u.toLowerCase()));
  const destUsers = await dbAdapter.getFeedOwnersByUsernames(destNames);
  const destUserNames = destUsers.map((u) => u.username);

  const missNames = _.difference(destNames, destUserNames);

  if (missNames.length === 1) {
    throw new NotFoundException(`Account '${missNames[0]}' was not found`);
  } else if (missNames.length > 1) {
    throw new NotFoundException(`Some of destinations was not found: ${missNames.join(', ')}`);
  }

  // Checking if this will be a regular post or a direct message.
  // Mixed posts ("public directs") are prohibited.
  const isMixed = destUsers
    .map((u) => u.isGroup() || u.id === author.id)
    .some((v, i, arr) => v !== arr[0]);

  if (isMixed) {
    throw new ForbiddenException(`You can not create "public directs"`);
  }

  const destFeeds = await Promise.all(destUsers.map((u) => u.getFeedsToPost(author)));
  const deniedNames = destFeeds.map((x, i) => x.length === 0 ? destUsers[i].username : '').filter(Boolean);

  if (deniedNames.length > 0) {
    if (destUsers.length === 1) {
      const [destUser] = destUsers;

      if (destUser.isUser()) {
        throw new ForbiddenException(`You can not send private messages to '${destUser.username}'`);
      }

      throw new ForbiddenException(`You can not post to the '${destUser.username}' group`);
    }

    throw new ForbiddenException(`You can not post to some of destinations: ${deniedNames.join(', ')}`);
  }

  const timelineIds = _.flatten(destFeeds).map((f) => f.id);
  return timelineIds;
}

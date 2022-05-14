import _, { difference, differenceBy } from 'lodash';
import monitor from 'monitor-dog';
import compose from 'koa-compose';

import { AppTokenV1 } from '../../../models';
/** @typedef {import('../../../models').User} User */
/** @typedef {import('../../../models').Timeline} Timeline */
import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ValidationException,
} from '../../../support/exceptions';
import {
  postAccessRequired,
  authRequired,
  monitored,
  inputSchemaRequired,
} from '../../middlewares';
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
        post: { body, attachments },
      } = ctx.request.body;

      const destNames = typeof feeds === 'string' ? [feeds] : feeds;
      const timelineIds = await checkDestNames(destNames, author, ctx.modelRegistry.dbAdapter);

      if (attachments) {
        const attObjects = await ctx.modelRegistry.dbAdapter.getAttachmentsByIds(attachments);

        if (attObjects.some((a) => a.userId !== author.id)) {
          throw new ForbiddenException('You can not use attachments created by other user');
        }

        if (attObjects.some((a) => !!a.postId)) {
          throw new ForbiddenException('You can not use attachments from another post');
        }
      }

      const newPost = new ctx.modelRegistry.Post({
        userId: author.id,
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
        throw new ForbiddenException("You can't update another user's post");
      }

      const { body, attachments, feeds } = ctx.request.body.post;

      let { destinationFeedIds } = post;

      if (feeds) {
        const destUids = await checkDestNames(feeds, user, ctx.modelRegistry.dbAdapter);
        const [destFeeds, isDirect] = await Promise.all([
          ctx.modelRegistry.dbAdapter.getTimelinesByIds(destUids),
          post.isStrictlyDirect(),
        ]);

        if (destFeeds.length === 0) {
          if (isDirect) {
            // Trying to update direct to ourselves
            destFeeds.push(await user.getDirectsTimeline());
          } else {
            throw new ValidationException('The "feeds" list must contain at least one feed');
          }
        }

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
        const attObjects = await ctx.modelRegistry.dbAdapter.getAttachmentsByIds(attachments);

        if (attObjects.some((a) => a.userId !== user.id)) {
          throw new ForbiddenException('You can not use attachments created by other user');
        }

        if (attObjects.some((a) => a.postId && a.postId !== post.id)) {
          throw new ForbiddenException('You can not use attachments from another post');
        }
      }

      try {
        await post.update({ body, attachments, destinationFeedIds });
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

  /**
   * The 'destroy' method can have one or more 'fromFeed' GET-parameters. These
   * parameter defines the 'Posts' feeds (by username) from which this post
   * should be deleted.
   *
   * If there are no 'fromFeed' parameters, the post will be deleted completely
   * (by author) or from all managed groups (by groups admin).
   *
   * The direct post cannot be deleted from the someone's 'Directs' feed.
   */
  static destroy = compose([
    authRequired(),
    postAccessRequired(),
    async (ctx) => {
      /** @type {{ user: User, post: Post }} */
      const { user, post } = ctx.state;

      /** @type string[] */
      const fromFeedsNames = [];

      if (Array.isArray(ctx.request.query.fromFeed)) {
        fromFeedsNames.push(...ctx.request.query.fromFeed);
      } else if (typeof ctx.request.query.fromFeed === 'string') {
        fromFeedsNames.push(ctx.request.query.fromFeed);
      }

      if (!(await post.isAuthorOrGroupAdmin(user))) {
        throw new ForbiddenException("You can't delete another user's post");
      }

      const fromFeedsAccounts = await ctx.modelRegistry.dbAdapter.getFeedOwnersByUsernames(
        fromFeedsNames,
      );

      // All feed names should be valid
      {
        const invalidNames = difference(
          fromFeedsNames,
          fromFeedsAccounts.map((a) => a.username),
        );

        if (invalidNames.length > 0) {
          throw new ForbiddenException(`Feeds do not exist: ${invalidNames.join(', ')}`);
        }
      }

      const postDestinations = await post.getPostedTo();

      // All fromFeeds should be a 'Posts' destination feeds
      {
        const invalidNames = fromFeedsAccounts
          .filter((a) => !postDestinations.find((d) => d.userId === a.id && d.isPosts()))
          .map((a) => a.username);

        if (invalidNames.length > 0) {
          throw new ForbiddenException(`Post does not belong to: ${invalidNames.join(', ')}`);
        }
      }

      // The remover should be either a post author or admin of all fromFeeds
      if (post.userId !== user.id) {
        const isAdmins = await Promise.all(
          fromFeedsAccounts.map((a) =>
            ctx.modelRegistry.dbAdapter.isUserAdminOfGroup(user.id, a.id),
          ),
        );
        const invalidNames = isAdmins
          .map((v, i) => !v && fromFeedsAccounts[i].username)
          .filter(Boolean);

        if (invalidNames.length > 0) {
          throw new ForbiddenException(`You are not admin of: ${invalidNames.join(', ')}`);
        }
      }

      /** @type Timeline[] */
      let fromFeeds = [];

      // If fromFeeds is empty, then we should remove post from the maximum available amount of feeds.
      if (fromFeedsNames.length === 0) {
        if (post.userId === user.id) {
          fromFeeds = postDestinations;
        } else {
          const managedGroups = await user.getManagedGroups();
          fromFeeds = postDestinations.filter((d) => managedGroups.find((g) => g.id === d.userId));
        }
      } else {
        fromFeeds = await Promise.all(fromFeedsAccounts.map((a) => a.getPostsTimeline()));
      }

      // Now we should determine what feeds will remain in the post
      const feedsToRemain = differenceBy(postDestinations, fromFeeds, 'id');
      let postStillAvailable = false;

      if (feedsToRemain.length === 0) {
        // Complete removal
        await post.destroy(user);
        monitor.increment('posts.destroys');
      } else {
        // Partial removal: remove post only from several feeds
        await post.update({
          destinationFeedIds: _.map(feedsToRemain, 'intId'),
          updatedBy: user,
        });

        const updatedPost = await ctx.modelRegistry.dbAdapter.getPostById(post.id);
        postStillAvailable = await updatedPost.isVisibleFor(user);
      }

      ctx.body = { postStillAvailable };
    },
  ]);

  static hide = compose([
    authRequired(),
    postAccessRequired(),
    async (ctx) => {
      const { user, post } = ctx.state;

      await post.hide(user.id);
      ctx.body = {};
    },
  ]);

  static unhide = compose([
    authRequired(),
    postAccessRequired(),
    async (ctx) => {
      const { user, post } = ctx.state;

      await post.unhide(user.id);
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

      if (!(await post.isAuthorOrGroupAdmin(user))) {
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

      if (!(await post.isAuthorOrGroupAdmin(user))) {
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
 * @returns {Promise<string[]>}
 */
export async function checkDestNames(destNames, author, dbAdapter) {
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
  const deniedNames = destFeeds
    .map((x, i) => (x.length === 0 ? destUsers[i].username : ''))
    .filter(Boolean);

  if (deniedNames.length > 0) {
    if (destUsers.length === 1) {
      const [destUser] = destUsers;

      if (destUser.isUser()) {
        throw new ForbiddenException(`You can not send private messages to '${destUser.username}'`);
      }

      throw new ForbiddenException(`You can not post to the '${destUser.username}' group`);
    }

    throw new ForbiddenException(
      `You can not post to some of destinations: ${deniedNames.join(', ')}`,
    );
  }

  const timelineIds = _.uniq(_.flatten(destFeeds).map((f) => f.id));
  return timelineIds;
}

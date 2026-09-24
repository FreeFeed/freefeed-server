import _, { difference, differenceBy, uniqBy } from 'lodash-es';
import monitor from 'monitor-dog';
import compose from 'koa-compose';

import { dbAdapter, Post, AppTokenV1 } from '../../../models';
/** @typedef {import('../../../models').User} User */
/** @typedef {import('../../../models').Timeline} Timeline */
import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ValidationException,
  ConflictException,
} from '../../../support/exceptions';
import {
  postAccessRequired,
  authRequired,
  monitored,
  inputSchemaRequired,
} from '../../middlewares';
import { show as showPost } from '../v2/PostsController';
import { UndoPostDelete } from '../../../support/undo/post-delete';

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
        post: { body, attachments, articleId },
      } = ctx.request.body;

      const feedNames = typeof feeds === 'string' ? [feeds] : feeds;
      const destinationFeeds = await getDestinationFeeds(author, feedNames, null);

      if (attachments) {
        const attObjects = await dbAdapter.getAttachmentsByIds(attachments);

        if (attObjects.some((a) => a.userId !== author.id)) {
          throw new ForbiddenException('You can not use attachments created by other user');
        }

        if (attObjects.some((a) => !!a.postId)) {
          throw new ForbiddenException('You can not use attachments from another post');
        }
      }

      const article =
        articleId != null ? await validateArticleAssociation(articleId, author.id) : null;

      const newPost = new Post({
        userId: author.id,
        body,
        attachments,
        commentsDisabled: commentsDisabled ? '1' : '0',
        timelineIds: destinationFeeds.map((f) => f.id),
      });

      try {
        await newPost.create();

        if (article && !(await article.setPost(newPost.id))) {
          throw new ConflictException('Article association has changed');
        }
      } catch (e) {
        if (e instanceof ValidationException || e instanceof ConflictException) {
          throw e;
        }

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

      if (post.userId !== user.id) {
        throw new ForbiddenException("You can't update another user's post");
      }

      const { body, attachments, feeds: feedNames } = ctx.request.body.post;

      if (Object.hasOwn(ctx.request.body.post, 'articleId')) {
        throw new ValidationException('Article can only be associated when creating a post');
      }

      const existingFeeds = await post.getPostedTo();
      const destinationFeeds = feedNames
        ? await getDestinationFeeds(user, feedNames, existingFeeds)
        : existingFeeds;

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
        await post.update({
          body,
          attachments,
          destinationFeedIds: destinationFeeds.map((f) => f.intId),
        });
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
      const { 'operation-id': operationId = null } = ctx.request.headers;

      if (post.userId === user.id) {
        throw new ForbiddenException("You can't like your own post");
      }

      const success = await post.addLike(user, { operationId });

      if (
        !success &&
        // POST requests are legacy, and we don't allow user to like post that
        // he has already liked (by the legacy API contract). The new PUT/DELETE
        // idempotent API allows user to like/unlike post multiple times without
        // error.
        ctx.method === 'POST'
      ) {
        throw new ForbiddenException("You can't like post that you have already liked");
      }

      monitor.increment('posts.reactions');
      ctx.body = { meta: { operationId } };
    },
  ]);

  static unlike = compose([
    authRequired(),
    postAccessRequired(),
    monitored('posts.unlikes'),
    async (ctx) => {
      const { user, post } = ctx.state;
      const { 'operation-id': operationId = null } = ctx.request.headers;

      const success = await post.removeLike(user, { operationId });

      if (
        !success &&
        // POST requests are legacy, and we don't allow user to like post that
        // he has already liked (by the legacy API contract). The new PUT/DELETE
        // idempotent API allows user to like/unlike post multiple times without
        // error.
        ctx.method === 'POST'
      ) {
        throw new ForbiddenException("You can't un-like post that you haven't yet liked");
      }

      monitor.decrement('posts.reactions');
      ctx.body = { meta: { operationId } };
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

      const fromFeedsAccounts = await dbAdapter.getFeedOwnersByUsernames(fromFeedsNames);

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
          fromFeedsAccounts.map((a) => dbAdapter.isUserAdminOfGroup(user.id, a.id)),
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
      const undo = [];

      if (feedsToRemain.length === 0) {
        // Start the complete removal process
        if (await post.inactivate(user)) {
          const author = await dbAdapter.getUserById(post.userId);
          undo.push(
            new UndoPostDelete(post.id).serialize(
              user.id,
              author.id === user.id
                ? 'You deleted your post'
                : `You deleted ${author.username}'s post`,
              { author: author.username },
            ),
          );
          monitor.increment('posts.destroys');
        }
      } else {
        // Partial removal: remove post only from several feeds
        await post.update({
          destinationFeedIds: _.map(feedsToRemain, 'intId'),
          updatedBy: user,
        });

        const updatedPost = await dbAdapter.getPostById(post.id);
        postStillAvailable = await updatedPost.isVisibleFor(user);
      }

      ctx.body = { postStillAvailable, undo };
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

async function validateArticleAssociation(articleId, authorId) {
  const article = await dbAdapter.getArticleById(articleId);

  if (!article || article.authorId !== authorId || article.toDelete) {
    throw new ValidationException('Article is unavailable');
  }

  if (article.postId !== null) {
    const post = await dbAdapter.getPostById(article.postId);

    if (post && !post.toDelete) {
      throw new ConflictException('Article is already linked to another post');
    }
  }

  return article;
}

/**
 * Returns the destination feeds for a new or updated post. This function checks
 * the correctness and permissions for the given feed names and throws HTTP
 * errors if necessary.
 *
 * @param {User} postAuthor - The author of the post.
 * @param {string[]} feedNames - An array of feed names of new or updated post.
 * @param {Timeline[]|null} existingFeeds - Use null to indicate that it is a
   new post. Provide an array of existing feeds if it is an updated post.
 * @returns {Promise<Timeline[]>}
 */
export async function getDestinationFeeds(postAuthor, feedNames, existingFeeds) {
  const owners = await Promise.all(feedNames.map((name) => dbAdapter.getFeedOwnerByUsername(name)));
  const missNames = feedNames.filter((_unused, i) => !owners[i]);

  if (missNames.length === 1) {
    throw new NotFoundException(`Account '${missNames[0]}' was not found`);
  } else if (missNames.length > 1) {
    throw new NotFoundException(`Some of destinations was not found: ${missNames.join(', ')}`);
  }

  const feeds = await Promise.all(
    uniqBy(owners, 'id').map((acc) => {
      const feedName = acc.id === postAuthor.id || acc.isGroup() ? 'Posts' : 'Directs';
      return acc.getGenericTimeline(feedName);
    }),
  );

  const isDirect = (existingFeeds ?? feeds).every((f) => f.isDirects());

  if (isDirect) {
    feeds.push(await postAuthor.getDirectsTimeline());
  }

  /** @type {Timeline[]} */
  const feedsToAppend = differenceBy(feeds, existingFeeds ?? [], 'id');
  /** @type {Timeline[]} */
  const feedsToRemove = differenceBy(existingFeeds ?? [], feeds, 'id');

  if (isDirect) {
    if (feedsToRemove.length > 0) {
      throw new ForbiddenException('You can not remove any receivers from direct post');
    }

    if (feedsToAppend.some((f) => !f.isDirects())) {
      throw new ForbiddenException('You can not update direct post to regular one');
    }
  } else {
    if (feeds.length === 0) {
      throw new ValidationException('The "feeds" list must contain at least one feed');
    }

    if (feedsToAppend.some((f) => f.isDirects())) {
      throw new ForbiddenException('You can not update regular post to direct one');
    }
  }

  // We should only check permissions for feeds that are being added. The feeds
  // in which a post has already been published should not block changes even if
  // the author of the post has lost access to them.
  const rights = await Promise.all(feedsToAppend.map((f) => f.userCanPost(postAuthor)));
  const problemFeeds = feedsToAppend.filter((_unused, i) => !rights[i]);

  if (problemFeeds.length > 0) {
    const problemNames = await Promise.all(
      problemFeeds.map(async (f) => (await f.getUser()).username),
    );

    throw new ForbiddenException(
      `You can not post to some of destinations: ${problemNames.join(', ')}`,
    );
  }

  return feeds;
}

import _ from 'lodash'
import monitor from 'monitor-dog';
import compose from 'koa-compose';

import { dbAdapter, PostSerializer, Post } from '../../../models'
import { ForbiddenException, NotAuthorizedException, NotFoundException } from '../../../support/exceptions'
import { postAccessRequired, authRequired, monitored, inputSchemaRequired } from '../../middlewares';
import { show as showPost } from '../v2/PostsController';
import { postCreateInputSchema } from './data-schemes';

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

      await newPost.create();

      ctx.params.postId = newPost.id;

      await showPost(ctx);
    },
  ]);

  static async update(ctx) {
    if (!ctx.state.user) {
      throw new NotAuthorizedException();
    }

    const post = await dbAdapter.getPostById(ctx.params.postId)

    if (post.userId != ctx.state.user.id) {
      throw new ForbiddenException("You can't update another user's post")
    }

    await post.update({
      body:        ctx.request.body.post.body,
      attachments: ctx.request.body.post.attachments
    })

    const json = await new PostSerializer(post).promiseToJSON()
    ctx.body = json
  }

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

  static async destroy(ctx) {
    if (!ctx.state.user) {
      throw new NotAuthorizedException();
    }

    const post = await dbAdapter.getPostById(ctx.params.postId)

    if (null === post) {
      throw new NotFoundException("Can't find post");
    }

    if (post.userId != ctx.state.user.id) {
      throw new ForbiddenException("You can't delete another user's post")
    }

    await post.destroy()
    ctx.body = {};

    monitor.increment('posts.destroys');
  }

  static async hide(ctx) {
    if (!ctx.state.user) {
      throw new NotAuthorizedException();
    }

    const post = await dbAdapter.getPostById(ctx.params.postId)

    if (null === post) {
      throw new NotFoundException("Can't find post");
    }

    await post.hide(ctx.state.user.id)
    ctx.body = {};
  }

  static async unhide(ctx) {
    if (!ctx.state.user) {
      throw new NotAuthorizedException();
    }

    const post = await dbAdapter.getPostById(ctx.params.postId)

    if (null === post) {
      throw new NotFoundException("Can't find post");
    }

    await post.unhide(ctx.state.user.id)
    ctx.body = {};
  }

  static async disableComments(ctx) {
    if (!ctx.state.user) {
      throw new NotAuthorizedException();
    }

    const post = await dbAdapter.getPostById(ctx.params.postId)

    if (null === post) {
      throw new NotFoundException("Can't find post");
    }

    if (post.userId != ctx.state.user.id) {
      throw new ForbiddenException("You can't disable comments for another user's post")
    }

    await post.setCommentsDisabled('1')

    ctx.body = {};
  }

  static async enableComments(ctx) {
    if (!ctx.state.user) {
      throw new NotAuthorizedException();
    }

    const post = await dbAdapter.getPostById(ctx.params.postId)

    if (null === post) {
      throw new NotFoundException("Can't find post");
    }

    if (post.userId != ctx.state.user.id) {
      throw new ForbiddenException("You can't enable comments for another user's post")
    }

    await post.setCommentsDisabled('0')

    ctx.body = {};
  }
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
  const destUsers = await dbAdapter.getFeedOwnersByUsernames(destNames);
  if (destNames.length !== destUsers.length) {
    if (destNames.length === 1) {
      throw new NotFoundException(`Account '${destNames[0]}' was not found`);
    }
    throw new NotFoundException('Some of destination users was not found');
  }

  const destFeeds = await Promise.all(destUsers.map((u) => u.getFeedsToPost(author)));
  if (destFeeds.some((x) => x.length === 0)) {
    if (destUsers.length === 1) {
      const [destUser] = destUsers;
      if (destUser.isUser()) {
        throw new ForbiddenException(`You can not send private messages to '${destUser.username}'`);
      }
      throw new ForbiddenException(`You can not post to the '${destUser.username}' group`);
    }
    throw new ForbiddenException('You can not post to some of destination feeds');
  }

  const timelineIds = _.flatten(destFeeds).map((f) => f.id);
  return timelineIds;
}

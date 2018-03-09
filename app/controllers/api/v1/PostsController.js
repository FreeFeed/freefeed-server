import _ from 'lodash'
import monitor from 'monitor-dog';
import compose from 'koa-compose';

import { dbAdapter, PostSerializer } from '../../../models'
import { EventService } from '../../../support/EventService'
import { ForbiddenException, NotAuthorizedException, NotFoundException, BadRequestException } from '../../../support/exceptions'
import { postAccessRequired, authRequired, monitored } from '../../middlewares';

export default class PostsController {
  static async create(ctx) {
    if (!ctx.state.user) {
      throw new NotAuthorizedException();
    }

    const timer = monitor.timer('posts.create-time');

    const meta = ctx.request.body.meta || {};

    if (!meta.feeds) {
      throw new NotAuthorizedException('Cannot publish post to /dev/null');
    }

    if (!_.isArray(meta.feeds)) {
      meta.feeds = [meta.feeds];
    }

    const { feeds } = meta;

    if (feeds.length === 0) {
      throw new BadRequestException('Cannot publish post to /dev/null');
    }

    const commentsDisabled = (meta.commentsDisabled ? '1' : '0')

    if (feeds.filter((feed) => !_.isString(feed)).length > 0) {
      throw new BadRequestException('Bogus "feeds" parameter');
    }

    try {
      const promises = feeds.map(async (username) => {
        const feed = await dbAdapter.getFeedOwnerByUsername(username)
        if (null === feed) {
          return null
        }

        await feed.validateCanPost(ctx.state.user)

        // we are going to publish this message to posts feed if
        // it's my home feed or group's feed, otherwise this is a
        // private message that goes to its own feed(s)
        if (
          (feed.isUser() && feed.id == ctx.state.user.id) ||
          !feed.isUser()
        ) {
          return feed.getPostsTimelineId()
        }

        // private post goes to sendee and sender
        return await Promise.all([
          feed.getDirectsTimelineId(),
          ctx.state.user.getDirectsTimelineId()
        ])
      })
      const timelineIds = _.flatten(await Promise.all(promises))
      _.each(timelineIds, (id, i) => {
        if (null == id) {
          throw new NotFoundException(`Feed "${feeds[i]}" is not found`)
        }
      })

      const newPost = await ctx.state.user.newPost({
        body:        ctx.request.body.post.body,
        attachments: ctx.request.body.post.attachments,
        timelineIds,
        commentsDisabled
      })

      await newPost.create()
      await EventService.onPostCreated(newPost, timelineIds, ctx.state.user);

      const json = new PostSerializer(newPost).promiseToJSON()
      ctx.body = await json;

      monitor.increment('posts.creates');
    } finally {
      timer.stop();
    }
  }

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

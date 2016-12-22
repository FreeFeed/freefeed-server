import _ from 'lodash'
import monitor from 'monitor-dog';

import { dbAdapter, PostSerializer, PubSub as pubSub } from '../../../models'
import { ForbiddenException, NotAuthorizedException, NotFoundException } from '../../../support/exceptions'


export default class PostsController {
  static async create(ctx) {
    if (!ctx.state.user) {
      throw new NotAuthorizedException();
    }

    const timer = monitor.timer('posts.create-time');

    const meta = ctx.request.body.meta || {}

    let feeds = []
    if (_.isArray(meta.feeds)) {
      feeds = meta.feeds
    } else if (meta.feeds) {
      feeds = [meta.feeds]
    } else {
      throw new NotAuthorizedException('Cannot publish post to /dev/null');
    }

    const commentsDisabled = (meta.commentsDisabled ? '1' : '0')

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

  static async show(ctx) {
    const timer = monitor.timer('posts.show-time');

    try {
      const userId = ctx.state.user ? ctx.state.user.id : null
      const post = await dbAdapter.getPostById(ctx.params.postId, {
        maxComments: ctx.request.query.maxComments,
        maxLikes:    ctx.request.query.maxLikes,
        currentUser: userId
      })

      if (null === post) {
        throw new NotFoundException("Can't find post");
      }

      const valid = await post.canShow(userId)

      // this is a private post
      if (!valid)
        throw new ForbiddenException('Not found')

      if (ctx.state.user) {
        const banIds = await dbAdapter.getUserBansIds(post.userId)

        if (banIds.includes(ctx.state.user.id))
          throw new ForbiddenException('This user has prevented you from seeing their posts')

        const yourBanIds = await ctx.state.user.getBanIds()

        if (yourBanIds.includes(post.userId))
          throw new ForbiddenException('You have blocked this user and do not want to see their posts')
      }

      const json = new PostSerializer(post).promiseToJSON()
      ctx.body = await json;

      monitor.increment('posts.show-requests');
    } finally {
      timer.stop();
    }
  }

  static async like(ctx) {
    if (!ctx.state.user) {
      throw new NotAuthorizedException();
    }

    const timer = monitor.timer('posts.likes.time');

    try {
      const post = await dbAdapter.getPostById(ctx.params.postId)

      if (null === post) {
        throw new NotFoundException("Can't find post");
      }

      const authorId = post.userId;

      if (authorId === ctx.state.user.id) {
        throw new ForbiddenException("You can't like your own post")
      }

      const isVisible = await post.canShow(ctx.state.user.id)
      if (!isVisible) {
        throw new NotFoundException("Can't find post");
      }

      const banIds = await dbAdapter.getUserBansIds(authorId);

      if (banIds.includes(ctx.state.user.id)) {
        throw new ForbiddenException('Author of this post has banned you');
      }

      const yourBanIds = await ctx.state.user.getBanIds();

      if (yourBanIds.includes(authorId)) {
        throw new ForbiddenException('You have banned the author of this post');
      }

      const userLikedPost = await dbAdapter.hasUserLikedPost(ctx.state.user.id, post.id)

      if (userLikedPost) {
        throw new ForbiddenException("You can't like post that you have already liked")
      }

      try {
        const affectedTimelines = await post.addLike(ctx.state.user)

        await dbAdapter.statsLikeCreated(ctx.state.user.id)

        ctx.status = 200;
        ctx.body = {};

        await pubSub.newLike(post, ctx.state.user.id, affectedTimelines)

        monitor.increment('posts.likes');
        monitor.increment('posts.reactions');
      } catch (e) {
        if (e.code === '23505') {
          // '23505' stands for unique_violation
          // see https://www.postgresql.org/docs/current/static/errcodes-appendix.html
          throw new ForbiddenException("You can't like post that you have already liked")
        }

        throw e;
      }
    } finally {
      timer.stop();
    }
  }

  static async unlike(ctx) {
    if (!ctx.state.user) {
      throw new NotAuthorizedException();
    }

    const timer = monitor.timer('posts.unlikes.time');

    try {
      const post = await dbAdapter.getPostById(ctx.params.postId)

      if (null === post) {
        throw new NotFoundException("Can't find post");
      }

      if (post.userId === ctx.state.user.id) {
        throw new ForbiddenException("You can't un-like your own post")
      }

      const author = await dbAdapter.getUserById(post.userId);
      const banIds = await author.getBanIds();

      if (banIds.includes(ctx.state.user.id)) {
        throw new ForbiddenException('Author of this post has blocked you');
      }

      const yourBanIds = await ctx.state.user.getBanIds();

      if (yourBanIds.includes(author.id)) {
        throw new ForbiddenException('You have blocked the author of this post');
      }

      const userLikedPost = await dbAdapter.hasUserLikedPost(ctx.state.user.id, post.id)
      if (!userLikedPost) {
        throw new ForbiddenException("You can't un-like post that you haven't yet liked")
      }

      const valid = await post.canShow(ctx.state.user.id)
      if (!valid) {
        throw new Error('Not found')
      }

      await post.removeLike(ctx.state.user.id)

      await dbAdapter.statsLikeDeleted(ctx.state.user.id)

      ctx.status = 200;
      ctx.body = {};

      monitor.increment('posts.unlikes');
      monitor.increment('posts.unreactions');
    } finally {
      timer.stop();
    }
  }

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

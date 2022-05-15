import compose from 'koa-compose';

import { authRequired, monitored, inputSchemaRequired } from '../../middlewares';
import { serializeTimeline } from '../../../serializers/v2/timeline';
import { serializeUsersByIds } from '../../../serializers/v2/user';
import {
  ValidationException,
  NotFoundException,
  ForbiddenException,
} from '../../../support/exceptions';

import {
  createHomeFeedInputSchema,
  updateHomeFeedInputSchema,
  deleteHomeFeedInputSchema,
  reorderHomeFeedsInputSchema,
} from './data-schemes/homefeeds';

export const listHomeFeeds = compose([
  authRequired(),
  async (ctx) => {
    const {
      state: { user },
    } = ctx;

    const homeFeeds = await user.getHomeFeeds();
    const timelines = homeFeeds.map((t) => serializeTimeline(t));
    const users = await serializeUsersByIds([user.id]);

    ctx.body = { timelines, users };
  },
]);

export const createHomeFeed = compose([
  authRequired(),
  inputSchemaRequired(createHomeFeedInputSchema),
  monitored('homefeeds.create'),
  async (ctx) => {
    const {
      state: { user },
      request: { body },
    } = ctx;

    const title = body.title.trim();

    if (title === '') {
      throw new ValidationException(`Feed title cannot be empty`);
    }

    const feed = await user.createHomeFeed(body.title);

    await ctx.modelRegistry.pubSub.updateHomeFeeds(user.id);

    if ('subscribedTo' in body) {
      await feed.updateHomeFeedSubscriptions(body.subscribedTo);
    }

    ctx.params.feedId = feed.id;
    await getHomeFeedInfo(ctx);
  },
]);

export const updateHomeFeed = compose([
  authRequired(),
  inputSchemaRequired(updateHomeFeedInputSchema),
  monitored('homefeeds.update'),
  async (ctx) => {
    const {
      state: { user },
      request: { body },
    } = ctx;

    const feed = await ctx.modelRegistry.dbAdapter.getTimelineById(ctx.params.feedId);

    if (!feed || feed.userId !== user.id || feed.name !== 'RiverOfNews') {
      throw new NotFoundException(`Home feed is not found`);
    }

    if ('title' in body) {
      if (feed.isInherent) {
        throw new ForbiddenException(`The inherent feed title cannot be updated`);
      }

      const ok = await feed.update({ title: body.title });

      if (!ok) {
        throw new NotFoundException(`Home feed is not found`);
      }

      await ctx.modelRegistry.pubSub.updateHomeFeeds(user.id);
    }

    if ('subscribedTo' in body) {
      await feed.updateHomeFeedSubscriptions(body.subscribedTo);
    }

    await getHomeFeedInfo(ctx);
  },
]);

export const deleteHomeFeed = compose([
  authRequired(),
  inputSchemaRequired(deleteHomeFeedInputSchema),
  monitored('homefeeds.delete'),
  async (ctx) => {
    const {
      state: { user },
      request: { body },
    } = ctx;

    const feed = await ctx.modelRegistry.dbAdapter.getTimelineById(ctx.params.feedId);

    if (!feed || feed.userId !== user.id || feed.name !== 'RiverOfNews') {
      throw new NotFoundException(`Home feed is not found`);
    }

    if (feed.isInherent) {
      throw new ForbiddenException(`This inherent feed cannot be removed`);
    }

    const params = { backupFeedId: body.backupFeed };
    const ok = await feed.destroy(params);

    if (!ok) {
      throw new NotFoundException(`Home feed is not found`);
    }

    await ctx.modelRegistry.pubSub.updateHomeFeeds(user.id);

    ctx.body = { backupFeed: params.backupFeedId };
  },
]);

export const reorderHomeFeeds = compose([
  authRequired(),
  inputSchemaRequired(reorderHomeFeedsInputSchema),
  monitored('homefeeds.reorder'),
  async (ctx) => {
    const {
      state: { user },
      request: { body },
    } = ctx;

    const feeds = await ctx.modelRegistry.dbAdapter.getTimelinesByIds(body.reorder);

    if (feeds.length === 0 || feeds.some((f) => f.userId !== user.id || f.name !== 'RiverOfNews')) {
      throw new ForbiddenException(`These feeds cannot be reordered`);
    }

    await ctx.modelRegistry.dbAdapter.reorderFeeds(feeds.map((f) => f.id));

    await ctx.modelRegistry.pubSub.updateHomeFeeds(user.id);

    await listHomeFeeds(ctx);
  },
]);

export const listSubscriptions = compose([
  authRequired(),
  monitored('homefeeds.list-subscriptions'),
  async (ctx) => {
    const {
      state: { user },
    } = ctx;

    const [subs, homeFeeds] = await Promise.all([
      user.getSubscriptionsWithHomeFeeds(),
      user.getHomeFeeds(),
    ]);

    const timelines = homeFeeds.map((t) => serializeTimeline(t));
    const usersInHomeFeeds = subs.map((s) => ({ id: s.user_id, homeFeeds: s.homefeed_ids }));
    const users = await serializeUsersByIds(
      [user.id, ...usersInHomeFeeds.map((s) => s.id)],
      true,
      user.id,
    );

    ctx.body = {
      usersInHomeFeeds,
      timelines,
      users,
    };
  },
]);

export const getHomeFeedInfo = compose([
  authRequired(),
  async (ctx) => {
    const {
      state: { user },
    } = ctx;

    const feed = await ctx.modelRegistry.dbAdapter.getTimelineById(ctx.params.feedId);

    if (!feed || feed.userId !== user.id || feed.name !== 'RiverOfNews') {
      throw new NotFoundException(`Home feed is not found`);
    }

    const subscribedTo = await feed.getHomeFeedSubscriptions();
    const users = await serializeUsersByIds([...subscribedTo, feed.userId], true, user.id);

    ctx.body = {
      timeline: serializeTimeline(feed),
      subscribedTo,
      users,
    };
  },
]);

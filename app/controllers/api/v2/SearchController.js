import compose from 'koa-compose';

import { dbAdapter } from '../../../models';
import { serializeFeed } from '../../../serializers/v2/post';
import { monitored } from '../../middlewares';

import { ORD_CREATED, ORD_UPDATED } from './TimelinesController';


export default class SearchController {
  search = compose([
    monitored('search'),
    async (ctx) => {
      const DEFAULT_LIMIT = 30;
      const MAX_LIMIT = 120;

      const { state: { user } } = ctx;
      const query = (ctx.request.query.qs || '').trim();
      let offset = parseInt(ctx.request.query.offset, 10);
      let limit = parseInt(ctx.request.query.limit, 10);
      const sort =
        ctx.request.query.sort === ORD_CREATED ||
        ctx.request.query.sort === ORD_UPDATED
          ? ctx.request.query.sort
          : ORD_UPDATED;

      if (!Number.isFinite(offset) || offset < 0) {
        offset = 0;
      }

      if (!Number.isFinite(limit) || limit < 0 || limit > MAX_LIMIT) {
        limit = DEFAULT_LIMIT;
      }

      const postIds = query
        ? await dbAdapter.search(query, {
          viewerId: user && user.id,
          limit:    limit + 1,
          offset,
          sort
        })
        : []; // return nothing if query is empty

      const isLastPage = postIds.length <= limit;

      if (!isLastPage) {
        postIds.length = limit;
      }

      ctx.body = await serializeFeed(postIds, user && user.id, null, { isLastPage });
    }
  ]);
}

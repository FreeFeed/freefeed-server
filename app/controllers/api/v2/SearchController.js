import compose from 'koa-compose';

import { dbAdapter } from '../../../models';
import { serializeFeed } from '../../../serializers/v2/post';
import { monitored } from '../../middlewares';


export default class SearchController {
  search = compose([
    monitored('search'),
    async (ctx) => {
      const DEFAULT_LIMIT = 30;
      const MAX_LIMIT = 120;

      const { state: { user } } = ctx;
      const query = ctx.request.query.qs || '';
      let offset = parseInt(ctx.request.query.offset, 10);
      let limit = parseInt(ctx.request.query.limit, 10);

      if (!Number.isFinite(offset) || offset < 0) {
        offset = 0;
      }

      if (!Number.isFinite(limit) || limit < 0 || limit > MAX_LIMIT) {
        limit = DEFAULT_LIMIT;
      }

      const postIds = await dbAdapter.search(query, {
        viewerId: user && user.id,
        limit:    limit + 1,
        offset
      });

      const isLastPage = postIds.length <= limit;

      if (!isLastPage) {
        postIds.length = limit;
      }

      ctx.body = await serializeFeed(postIds, user && user.id, null, { isLastPage });
    }
  ]);
}

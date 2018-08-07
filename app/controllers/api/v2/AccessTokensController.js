import compose from 'koa-compose';

import { dbAdapter } from '../../../models'
import { authRequired, monitored } from '../../middlewares';
import { serializeAccessToken } from '../../../serializers/v2/accessToken';


export const getTokens = compose([
  authRequired(),
  monitored('tokens.get'),
  async (ctx) => {
    const currentUserId = ctx.state.user.id;
    const tokens = await dbAdapter.getAccessTokens(currentUserId);
    ctx.body = tokens.map(serializeAccessToken);
  }
]);

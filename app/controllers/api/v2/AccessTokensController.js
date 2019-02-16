import crypto from 'crypto';
import compose from 'koa-compose';

import { dbAdapter } from '../../../models'
import { authRequired, monitored } from '../../middlewares';
import { serializeAccessToken } from '../../../serializers/v2/accessToken';
import { NotFoundException, ForbiddenException } from '../../../support/exceptions';


export const getTokens = compose([
  authRequired(true),
  monitored('tokens.get'),
  async (ctx) => {
    const currentUserId = ctx.state.user.id;
    const tokens = await dbAdapter.getAccessTokens(currentUserId);
    ctx.body = tokens.map(serializeAccessToken);
  }
]);

export const createToken = compose([
  authRequired(true),
  monitored('tokens.create'),
  async (ctx) => {
    const currentUserId = ctx.state.user.id;
    const description = ctx.request.body.description; // eslint-disable-line prefer-destructuring
    const code = crypto.randomBytes(128).toString('base64');

    const tokenId = await dbAdapter.createAccessToken(currentUserId, description, code);

    const token = await dbAdapter.getAccessTokenById(currentUserId, tokenId);
    ctx.body = serializeAccessToken(token);
  }
]);

export const revokeToken = compose([
  authRequired(true),
  monitored('tokens.revoke'),
  async (ctx) => {
    const currentUserId = ctx.state.user.id;
    const { tokenId } = ctx.params;

    const token = await dbAdapter.getAccessTokenById(currentUserId, tokenId);

    if (token === null) {
      throw new NotFoundException("Can't find token");
    }

    if (token.status !== 'active') {
      throw new ForbiddenException('Token is already revoked');
    }

    await dbAdapter.revokeAccessToken(tokenId);

    ctx.body = serializeAccessToken({ ...token, status: 'revoked' });
  }
]);

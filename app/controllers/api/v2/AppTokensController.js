import { pick, difference } from 'lodash';
import compose from 'koa-compose';

import { authRequired, monitored, inputSchemaRequired } from '../../middlewares';
import { AppTokenV1, dbAdapter } from '../../../models';
import {
  ValidationException,
  NotFoundException,
  ForbiddenException,
} from '../../../support/exceptions';
import { appTokensScopes } from '../../../models/app-tokens-scopes';
import { Address } from '../../../support/ipv6';

import { appTokenCreateInputSchema, appTokenUpdateInputSchema } from './data-schemes/app-tokens';

export const create = compose([
  authRequired(),
  inputSchemaRequired(appTokenCreateInputSchema),
  monitored('app-tokens.create'),
  async (ctx) => {
    const {
      state: { user },
      request: { body },
    } = ctx;

    const validScopes = appTokensScopes.map(({ name }) => name);
    const unknownScopes = difference(body.scopes, validScopes);

    if (unknownScopes.length > 0) {
      throw new ValidationException(`Unknown scopes: ${unknownScopes.join(', ')}`);
    }

    const invalidNetmasks = body.restrictions.netmasks.filter((mask) => {
      try {
        new Address(mask);
        return false;
      } catch (e) {
        return true;
      }
    });

    if (invalidNetmasks.length > 0) {
      throw new ValidationException(`Invalid netmasks: ${invalidNetmasks.join(', ')}`);
    }

    const invalidOrigins = body.restrictions.origins.filter((o) => !/^https?:\/\/[^/]+$/.test(o));

    if (invalidOrigins.length > 0) {
      throw new ValidationException(`Invalid origins: ${invalidOrigins.join(', ')}`);
    }

    const token = new AppTokenV1({
      userId: user.id,
      title: body.title,
      scopes: body.scopes,
      restrictions: body.restrictions,
    });

    await token.create();

    ctx.body = {
      token: serializeAppToken(token),
      tokenString: token.tokenString(),
    };
  },
]);

export const inactivate = compose([
  authRequired(),
  monitored('app-tokens.inactivate'),
  async (ctx) => {
    const { user } = ctx.state;
    const token = await dbAdapter.getAppTokenById(ctx.params.tokenId);

    if (!token || token.userId !== user.id) {
      throw new NotFoundException('Token not found');
    }

    await token.inactivate();

    ctx.body = {};
  },
]);

export const reissue = compose([
  authRequired(),
  monitored('app-tokens.reissue'),
  async (ctx) => {
    const { user, authToken: currentToken } = ctx.state;
    const token = await dbAdapter.getAppTokenById(ctx.params.tokenId);

    if (!token || token.userId !== user.id || !token.isActive) {
      throw new NotFoundException('Token not found');
    }

    if (
      !currentToken.hasFullAccess() &&
      !(currentToken instanceof AppTokenV1 && currentToken.id === token.id)
    ) {
      throw new ForbiddenException('Access denied');
    }

    await token.reissue();

    ctx.body = {
      token: serializeAppToken(token),
      tokenString: token.tokenString(),
    };
  },
]);

export const update = compose([
  authRequired(),
  inputSchemaRequired(appTokenUpdateInputSchema),
  monitored('app-tokens.update'),
  async (ctx) => {
    const {
      state: { user },
      request: {
        body: { title },
      },
    } = ctx;
    const token = await dbAdapter.getAppTokenById(ctx.params.tokenId);

    if (!token || token.userId !== user.id || !token.isActive) {
      throw new NotFoundException('Token not found');
    }

    await token.setTitle(title);

    ctx.body = { token: serializeAppToken(token) };
  },
]);

export const list = compose([
  authRequired(),
  monitored('app-tokens.update'),
  async (ctx) => {
    const {
      state: { user },
    } = ctx;

    const tokens = await dbAdapter.listActiveAppTokens(user.id);

    ctx.body = { tokens: tokens.map(serializeAppToken) };
  },
]);

export const scopes = (ctx) => (ctx.body = { scopes: appTokensScopes });

function serializeAppToken(token) {
  return pick(token, [
    'id',
    'title',
    'issue',
    'createdAt',
    'updatedAt',
    'scopes',
    'restrictions',
    'lastUsedAt',
    'lastIP',
    'lastUserAgent',
  ]);
}

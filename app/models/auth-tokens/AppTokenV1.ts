import crypto from 'crypto';

import _ from 'lodash';
import jwt from 'jsonwebtoken'
import config from 'config';
import Raven from 'raven';
import { Context, Next } from 'koa';
import { isConst, isNumber, isObject, isString } from 'ts-json-check';

import { DbAdapter } from '../../support/DbAdapter';
import { IPAddr, Nullable, UUID } from '../../support/types';
import { Address } from '../../support/ipv6';
import { database } from '../common';
import { NotAuthorizedException } from '../../support/exceptions';

import { AuthToken } from './AuthToken';
import { AppTokenRecord } from './types';
import { alwaysAllowedRoutes, alwaysDisallowedRoutes, appTokensScopes } from './app-tokens-scopes';

import { authDebugError } from '.';


const appTokenUsageDebounce = '10 sec'; // PostgreSQL 'interval' type syntax

const activationCodeChars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

type Restrictions = {
  netmasks: string[];
  origins: string[];
}

const tokenType = 'app.v1';

const isAppTokenJWTPayload = isObject({
  type:   isConst(tokenType),
  userId: isString,
  issue:  isNumber,
});

/**
 * Application token v1
 */
export class AppTokenV1 extends AuthToken {
  static TYPE = tokenType;

  public title: string;
  public id: UUID;
  public createdAt: Date;
  public updatedAt: Date;
  public isActive: boolean;
  public issue: number;
  public expiresAt: Nullable<Date>;
  public scopes: string[];
  public restrictions: Restrictions;
  public lastUsedAt: Nullable<Date>;
  public lastIP: Nullable<IPAddr>;
  public lastUserAgent: Nullable<string>;
  public activationCode: Nullable<string>;

  private readonly [database]: DbAdapter;

  constructor(params: AppTokenRecord, dbAdapter: DbAdapter) {
    super(params.userId);

    this[database] = dbAdapter;

    this.id = params.id;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;

    this.title = params.title;

    this.isActive = params.isActive;
    this.issue = params.issue;
    this.expiresAt = params.expiresAt;
    this.scopes = params.scopes;
    this.restrictions = {
      netmasks: params.restrictions.netmasks ?? [],
      origins:  params.restrictions.origins ?? [],
    };
    this.lastUsedAt = params.lastUsedAt;
    this.lastIP = params.lastIP;
    this.lastUserAgent = params.lastUserAgent;
    this.activationCode = params.activationCode;
  }

  toString() {
    return `${super.toString()}#${this.id}#${this.issue}`;
  }

  async middleware(ctx: Context, next: Next) {
    // Validate jwtPayload
    {
      const { authJWTPayload } = ctx.state;

      if (!isAppTokenJWTPayload(authJWTPayload)) {
        throw new NotAuthorizedException(`invalid JWT payload format`);
      }

      if (
        !this.isActive
      || this.issue !== authJWTPayload.issue
      || (this.expiresAt && this.expiresAt < new Date())
      ) {
        throw new NotAuthorizedException(`inactive or expired token`);
      }
    }

    // Restrictions (IPs and origins)
    try {
      this.checkRestrictions({ remoteIP: ctx.ip, headers: ctx.headers });
    } catch (e) {
      authDebugError(e.message)
      throw new NotAuthorizedException(e.message);
    }

    // Route access
    {
      const route = `${ctx.method === 'HEAD' ? 'GET' : ctx.method} ${ctx.state.matchedRoute}`;
      const routeAllowed =
        !alwaysDisallowedRoutes.includes(route) && (
          alwaysAllowedRoutes.includes(route)
          || appTokensScopes.some(({ name, routes }) => this.scopes.includes(name) && routes.includes(route))
        );

      if (!routeAllowed) {
        authDebugError(`app token has no access to '${route}'`);
        throw new NotAuthorizedException(`token has no access to this API method`);
      }
    }

    await this.registerUsage({ ip: ctx.ip, userAgent: ctx.headers['user-agent'] });

    await super.middleware(ctx, next);

    try {
      await this.logRequest(ctx);
    } catch (e) {
      // We should not break request at this step
      // but we must log error
      authDebugError(`cannot log app token usage: ${e.message}`);

      if (config.sentryDsn) {
        Raven.captureException(e, { extra: { err: `cannot log app token usage: ${e.message}` } });
      }
    }
  }

  async registerUsage({ ip, userAgent }: { ip: IPAddr, userAgent?: string }) {
    await this[database].registerAppTokenUsage(this.id, {
      ip:        new Address(ip).toString(),
      userAgent: userAgent || '',
      debounce:  appTokenUsageDebounce,
    });
  }

  static addLogPayload(ctx: Context, payload: any) {
    ctx.state.appTokenLogPayload = {
      ...(ctx.state.appTokenLogPayload || {}),
      ...payload,
    };
  }

  async logRequest(ctx: Context) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(ctx.method) || (ctx.status && ctx.status >= 400)) {
      return;
    }

    const payload = {
      token_id:   this.id,
      request:    `${ctx.method} ${ctx.url}`,
      ip:         ctx.ip,
      user_agent: ctx.headers['user-agent'] || '',
      extra:      {
        ..._.pick(ctx.headers, ['x-real-ip', 'x-forwarded-for']),
        ...(ctx.state.appTokenLogPayload || {}),
      },
    };

    await this[database].logAppTokenRequest(payload);
  }

  tokenString() {
    const { secret } = config;
    return jwt.sign({
      type:   AppTokenV1.TYPE,
      id:     this.id,
      issue:  this.issue,
      userId: this.userId,
    }, secret)
  }

  async setTitle(title: string) {
    await this[database].updateAppToken(this.id, { title });
    this.title = title;
  }

  async inactivate() {
    await this[database].updateAppToken(this.id, { isActive: false });
    this.isActive = false;
  }

  async reissue() {
    const updated = await this[database].reissueAppToken(this.id);
    this.issue = updated.issue;
    this.updatedAt = updated.updatedAt;
    this.activationCode = updated.activationCode;
  }

  /**
   * Token can be destroyed only when it's owner is permanently deleted. Do
   * not destroy tokens of active users, instead use inactivate() method.
   */
  destroy() {
    return this[database].deleteAppToken(this.id);
  }

  checkRestrictions({ headers, remoteIP }: { headers: any, remoteIP: string }) {
    const { netmasks, origins } = this.restrictions;

    if (netmasks.length > 0) {
      const remoteAddr = new Address(remoteIP);

      if (!netmasks.some((mask) => new Address(mask).contains(remoteAddr))) {
        throw new Error(`app token is not allowed from IP ${remoteIP}`)
      }
    }

    if (origins.length > 0 && !origins.includes(headers.origin)) {
      throw new Error(`app token is not allowed from origin ${headers.origin}`)
    }
  }

  static createActivationCode() {
    const bytes = crypto.randomBytes(6);
    return [...bytes].map((b) => activationCodeChars.charAt(b & 0x1f)).join('');
  }

  static normalizeActivationCode(input: string) {
    const code = input.toUpperCase()
      .replace(/[IL]/g, '1')
      .replace(/O/g, '0')
      .replace(/U/g, 'V')
      .replace(new RegExp(`[^${activationCodeChars}]`, 'g'), '');
    return code.length === 6 ? code : null;
  }
}

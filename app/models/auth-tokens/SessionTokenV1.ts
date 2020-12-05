import jwt from 'jsonwebtoken'
import config from 'config';
import { isConst, isNumber, isObject, isString } from 'ts-json-check';
import { Context, Next } from 'koa';

import { DbAdapter } from '../../support/DbAdapter';
import { IPAddr, Nullable, UUID } from '../../support/types';
import { Address } from '../../support/ipv6';
import { database } from '../common';
import { NotAuthorizedException } from '../../support/exceptions';

import { SessionRecord } from './types';
import { AuthToken } from './AuthToken';

// Session statuses:
// Active session
export const ACTIVE = 0;
// Session was closed by owner
export const CLOSED = 10;
// Session was blocked by system
export const BLOCKED = 20;

const tokenType = 'sess.v1';

const isSessionTokenJWTPayload = isObject({
  type:   isConst(tokenType),
  userId: isString,
  issue:  isNumber,
});

export class SessionTokenV1 extends AuthToken {
  static TYPE = tokenType;

  readonly hasFullAccess: boolean = true;

  public id!: UUID;
  public createdAt!: Date;
  public updatedAt!: Date;
  public status!: number;
  public issue!: number;
  public lastUsedAt!: Nullable<Date>;
  public lastIP!: Nullable<IPAddr>;
  public lastUserAgent!: Nullable<string>;
  public databaseTime!: Date;

  private readonly [database]: DbAdapter;

  constructor(params: SessionRecord, dbAdapter: DbAdapter) {
    super(params.userId);
    this[database] = dbAdapter;
    this.copyFieldsFrom(params);
  }

  private copyFieldsFrom(record: Nullable<SessionRecord>) {
    if (record) {
      this.id = record.id;
      this.createdAt = record.createdAt;
      this.updatedAt = record.updatedAt;
      this.status = record.status;
      this.issue = record.issue;
      this.lastUsedAt = record.lastUsedAt;
      this.lastIP = record.lastIP;
      this.lastUserAgent = record.lastUserAgent;
      this.databaseTime = record.databaseTime;
    }

    return !!record;
  }

  tokenString() {
    const { secret } = config;
    return jwt.sign({
      type:   tokenType,
      id:     this.id,
      issue:  this.issue,
      userId: this.userId,
    }, secret)
  }

  get isActive() {
    return this.status === ACTIVE;
  }

  async reissue() {
    const updated = await this[database].reissueActiveAuthSession(this.id);
    return this.copyFieldsFrom(updated);
  }

  async setStatus(status: number) {
    const updated = await this[database].updateAuthSession(this.id, { status });
    return this.copyFieldsFrom(updated);
  }

  async middleware(ctx: Context, next: Next) {
    // Validate jwtPayload
    {
      const { authJWTPayload } = ctx.state;

      if (!isSessionTokenJWTPayload(authJWTPayload)) {
        throw new NotAuthorizedException(`invalid JWT payload format`);
      }

      if (
        !this.isActive
      || this.issue !== authJWTPayload.issue // TODO inactivate it
      ) {
        throw new NotAuthorizedException(`inactive or expired token`);
      }
    }

    await this.registerUsage({ ip: ctx.ip, userAgent: ctx.headers['user-agent'] });
    await super.middleware(ctx, next);
  }

  async registerUsage({ ip, userAgent }: { ip: IPAddr, userAgent?: string }) {
    const updated = await this[database].registerAuthSessionUsage(this.id, {
      ip:          new Address(ip).toString(),
      userAgent:   userAgent || '',
      debounceSec: config.authSessions.usageDebounceSec,
    });
    return this.copyFieldsFrom(updated);
  }

  destroy() {
    return this[database].deleteAuthSession(this.id);
  }
}

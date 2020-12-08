import jwt from 'jsonwebtoken'
import config from 'config';
import { isConst, isNumber, isObject, isString } from 'ts-json-check';
import { Context, Next } from 'koa';

import { DbAdapter } from '../../support/DbAdapter';
import { IPAddr, Nullable, UUID } from '../../support/types';
import { Address } from '../../support/ipv6';
import { database } from '../common';
import { NotAuthorizedException } from '../../support/exceptions';
import Mailer from '../../../lib/mailer';

import { SessionRecord } from './types';
import { AuthToken } from './AuthToken';

import { authDebugError } from '.';

// Session statuses:
// Active session
export const ACTIVE = 0;
// Session was closed by owner
export const CLOSED = 10;
// Session was blocked by system
export const BLOCKED = 20;

export const statusTitles = {
  [ACTIVE]:  'ACTIVE',
  [CLOSED]:  'CLOSED',
  [BLOCKED]: 'BLOCKED',
};

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
      const { authJWTPayload: payload } = ctx.state;

      if (!isSessionTokenJWTPayload(payload)) {
        throw new NotAuthorizedException(`invalid JWT payload format`);
      }

      if (
        !this.isActive
        || !(
          this.issue === payload.issue
          || (
            // If the session was reissued less than reissueGraceIntervalSec ago
            this.issue === payload.issue + 1
            && this.updatedAt.getTime() > this.databaseTime.getTime()
              - (config.authSessions.reissueGraceIntervalSec * 1000)
          )
        )
      ) {
        // Block session if it is active and has invalid issue
        if (this.isActive) {
          await this.setStatus(BLOCKED);

          const user = await this.getUser();

          if (user?.isActive) {
            // Send email to user
            try {
              await Mailer.sendMail(
                user,
                'Your session has been blocked',
                {
                  access: {
                    ip:        new Address(ctx.ip).toString(),
                    userAgent: ctx.headers['user-agent'] || '',
                    date:      this.databaseTime,
                  },
                  session: this,
                },
                `${config.appRoot}/app/scripts/views/mailer/auth-session-blocked.ejs`
              );
            } catch (e) {
              authDebugError(`cannot send email to ${user.username}: ${e.message}`);
            }
          }
        }

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

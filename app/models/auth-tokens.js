import crypto from 'crypto';

import _ from 'lodash';
import jwt from 'jsonwebtoken'
import config from 'config';

import { scheduleTokenInactivation } from '../jobs/app-tokens';


const appTokenUsageDebounce = '10 sec'; // PostgreSQL 'interval' type syntax

/**
 * AuthToken
 * The common subset of all token classes
 */
export class AuthToken {
  userId;

  constructor(userId) { this.userId = userId; }

  hasFullAccess() { return false; }

  tokenString() { return 'ABSTRACT TOKEN'; }
}

/**
 * Session token v0 (legacy)
 * Eternal and almighty pepyatka-like JWT-token
 */
export class SessionTokenV0 extends AuthToken {
  hasFullAccess() {
    return true;
  }

  tokenString() {
    const { secret } = config;
    return jwt.sign({ userId: this.userId }, secret);
  }
}


export function addAppTokenV1Model(dbAdapter) {
  const activationCodeChars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

  /**
   * Application token v1
   */
  return class AppTokenV1 extends AuthToken {
    static TYPE = 'app.v1';

    id;
    title;
    isActive = true;
    issue = 1;
    createdAt;
    updatedAt;
    expiresAt;
    // This field of type number is for token creation only. Use it to set the
    // expiration time in seconds from the token's creation time.
    expiresAtSeconds;
    scopes = [];
    restrictions = {};
    lastUsedAt = null;
    lastIP = null;
    lastUserAgent = null;
    activationCode = null;

    constructor(params) {
      super(params.userId);

      for (const f of Object.keys(this)) {
        if (f in params) {
          this[f] = params[f];
        }
      }

      if (!this.restrictions.netmasks) {
        this.restrictions.netmasks = [];
      }

      if (!this.restrictions.origins) {
        this.restrictions.origins = [];
      }
    }

    toString() {
      return `${super.toString()}#${this.id}#${this.issue}`;
    }

    async create() {
      this.activationCode = AppTokenV1.newActivationCode();
      this.id = await dbAdapter.createAppToken(this);

      const newToken = await dbAdapter.getAppTokenById(this.id);
      const fieldsToUpdate = [
        'createdAt',
        'updatedAt',
        'expiresAt',
        'expiresAtSeconds', // for clean up
      ];

      for (const f of fieldsToUpdate) {
        this[f] = newToken[f];
      }

      await scheduleTokenInactivation(this);
    }

    async registerUsage({ ip, userAgent = '' }) {
      await dbAdapter.registerAppTokenUsage(this.id, { ip, userAgent, debounce: appTokenUsageDebounce });
    }

    static addLogPayload(ctx, payload) {
      ctx.state.appTokenLogPayload = {
        ...(ctx.state.appTokenLogPayload || {}),
        ...payload,
      };
    }

    async logRequest(ctx) {
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

      await dbAdapter.logAppTokenRequest(payload);
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

    async setTitle(title) {
      await dbAdapter.updateAppToken(this.id, { title });
      this.title = title;
    }

    async inactivate() {
      await dbAdapter.updateAppToken(this.id, { isActive: false });
      this.isActive = false;
    }

    async reissue() {
      const updatedToken = await dbAdapter.reissueAppToken(this.id, AppTokenV1.newActivationCode());
      const fieldsToUpdate = [
        'issue',
        'updatedAt',
        'activationCode',
      ];

      for (const f of fieldsToUpdate) {
        this[f] = updatedToken[f];
      }
    }

    /**
     * Token can be destroyed only when it's owner is permanently deleted. Do
     * not destroy tokens of active users, instead use inactivate() method.
     */
    async destroy() {
      await dbAdapter.deleteAppToken(this.id);
    }

    static newActivationCode() {
      const bytes = crypto.randomBytes(6);
      return [...bytes].map((b) => activationCodeChars.charAt(b & 0x1f)).join('');
    }

    static normalizeActivationCode(input) {
      const code = input.toUpperCase()
        .replace(/[IL]/g, '1')
        .replace(/O/g, '0')
        .replace(/U/g, 'V')
        .replace(new RegExp(`[^${activationCodeChars}]`, 'g'), '');
      return code.length === 6 ? code : null;
    }
  }
}

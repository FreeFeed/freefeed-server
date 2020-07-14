import _ from 'lodash';
import jwt from 'jsonwebtoken'
import config from 'config';


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
    scopes = [];
    restrictions = {};
    lastUsedAt = null;
    lastIP = null;
    lastUserAgent = null;

    constructor(params) {
      super(params.userId);

      const fields = [
        'id',
        'userId',
        'title',
        'isActive',
        'issue',
        'createdAt',
        'updatedAt',
        'scopes',
        'restrictions',
        'lastUsedAt',
        'lastIP',
        'lastUserAgent',
      ];

      for (const f of fields) {
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
      this.id = await dbAdapter.createAppToken(this);

      const newToken = await dbAdapter.getAppTokenById(this.id);
      const fieldsToUpdate = [
        'createdAt',
        'updatedAt',
      ];

      for (const f of fieldsToUpdate) {
        this[f] = newToken[f];
      }
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
      this.issue = await dbAdapter.reissueAppToken(this.id);
    }

    /**
     * Token can be destroyed only when it's owner is permanently deleted. Do
     * not destroy tokens of active users, instead use inactivate() method.
     */
    async destroy() {
      await dbAdapter.deleteAppToken(this.id);
    }
  }
}

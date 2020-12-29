import { Context } from 'koa';

import { DbAdapter } from '../../support/DbAdapter';
import { UUID } from '../../support/types';
import { Address } from '../../support/ipv6';
import { database, fallbackIP, fallbackUserAgent } from '../common';


export class SessionTokenV1Store {
  private readonly [database]: DbAdapter;

  constructor(dbAdapter: DbAdapter) {
    this[database] = dbAdapter;
  }

  create(userId: UUID, ctx?: Context, sessionId?: UUID) {
    return this[database].createAuthSession({
      userId,
      id:            sessionId,
      lastIP:        new Address(ctx?.ip || fallbackIP).toString(),
      lastUserAgent: ctx?.headers['user-agent'] || fallbackUserAgent,
    });
  }

  getById(id: UUID) {
    return this[database].getAuthSessionById(id);
  }

  list(userId: UUID) {
    return this[database].listAuthSessions(userId);
  }
}

import jwt from 'jsonwebtoken'
import config from 'config';

import { AuthToken } from './AuthToken';

/**
 * Session token v0 (legacy)
 * Eternal and almighty pepyatka-like JWT-token
 */
export class SessionTokenV0 extends AuthToken {
  readonly hasFullAccess: boolean = true;

  tokenString() {
    const { secret } = config;
    return jwt.sign({ userId: this.userId }, secret);
  }
}

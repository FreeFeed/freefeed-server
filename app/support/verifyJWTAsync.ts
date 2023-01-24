import util from 'util';

import config from 'config';
import jwt, { type Secret, type VerifyOptions } from 'jsonwebtoken';

export type JWTPayload = {
  type: string;
  id: string;
  issue: number;
  userId: string;
  iat: number;
};

const verifyAsync = util.promisify<string, Secret, VerifyOptions, JWTPayload>(jwt.verify);

export function verifyJWTAsync(
  token: string,
  secret: Secret = config.secret,
  options: VerifyOptions = {},
): Promise<JWTPayload> {
  return verifyAsync(token, secret, options);
}

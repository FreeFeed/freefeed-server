import config from 'config';
import jwt from 'jsonwebtoken';

export type JWTPayload = {
  type: string;
  id: string;
  issue: number;
  userId: string;
  iat: number;
};

export function verifyJWTSync(token: string, secret: string = config.secret): JWTPayload {
  return jwt.verify(token, secret) as JWTPayload;
}

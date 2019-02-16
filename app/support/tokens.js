import jwt from 'jsonwebtoken';
import { promisifyAll } from 'bluebird';

import { dbAdapter } from '../models';
import { load as configLoader } from '../../config/config';


promisifyAll(jwt);
const config = configLoader();

export async function getUserByToken(token) {
  let userId;
  let hasFullAccess = false;

  try {
    // It can be an old JWT token...
    const decrypted = await jwt.verifyAsync(token, config.secret);
    userId = decrypted.userId; // eslint-disable-line prefer-destructuring
    hasFullAccess = true;
  } catch (e) {
    // ...or it can be a new DB-stored access token with limited permissions
    userId = await dbAdapter.getUserIdByAccessToken(token);
  }

  if (!userId) {
    return null;
  }

  const user = await dbAdapter.getUserById(userId);
  user.hasFullAccess = hasFullAccess;

  return user;
}

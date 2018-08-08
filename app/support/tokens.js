import jwt from 'jsonwebtoken';
import { promisifyAll } from 'bluebird';

import { dbAdapter } from '../models';
import { load as configLoader } from '../../config/config';


promisifyAll(jwt);
const config = configLoader();

export async function getUserByToken(token) {
  let userId;

  try {
    // It can be an old JWT token...
    const decrypted = await jwt.verifyAsync(token, config.secret);
    userId = decrypted.userId; // eslint-disable-line prefer-destructuring
  } catch (e) {
    // ...or it can be a new DB-stored access token
    userId = await dbAdapter.getUserIdByAccessToken(token);
  }

  if (!userId) {
    return null;
  }

  return await dbAdapter.getUserById(userId);
}

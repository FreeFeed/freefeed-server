import crypto from 'crypto';
import { URL, URLSearchParams } from 'url';

import fetch from 'node-fetch';
import { isString } from 'lodash';

import { load as configLoader } from '../../config/config';


const config = configLoader();

export class NeedReauthorization extends Error {}

/**
 * Exchange the short-lived token for a long-lived one.
 */
export async function getLongLivedAccessToken({ accessToken }) {
  const url = new URL('https://graph.facebook.com/oauth/access_token');
  url.search = new URLSearchParams({
    grant_type:        'fb_exchange_token',
    client_id:         config.oauth.facebookClientId,
    client_secret:     config.oauth.facebookClientSecret,
    fb_exchange_token: accessToken,
  });

  const response = await (await fetch(url)).json();

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.access_token;
}

export async function getAllFriends({ facebookId, accessToken }) {
  let users = [];

  let url = new URL(`https://graph.facebook.com/v2.12/${facebookId}/friends`)
  url.search = new URLSearchParams({
    access_token:    accessToken,
    appsecret_proof: createProof(config.oauth.facebookClientSecret, accessToken),
  });

  do {
    // eslint-disable-next-line no-await-in-loop
    const response = await (await fetch(url)).json();

    // Error codes: https://developers.facebook.com/docs/graph-api/using-graph-api/error-handling
    if (response.error) {
      if (
        response.error.code == 190 ||
        (response.error.code == 102 && !response.error.error_subcode) ||
        [463, 467].includes(response.error.error_subcode)
      ) {
        throw new NeedReauthorization(response.error.message);
      }

      throw new Error(response.error.message);
    }

    users = users.concat(response.data);

    if (response.paging) {
      url = response.paging.next;
    } else {
      url = null;
    }
  } while (isString(url));

  return users;
}

function createProof(secret, accessToken) {
  return crypto.createHmac('sha256', secret)
    .update(accessToken)
    .digest('hex');
}

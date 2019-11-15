import fetch from 'node-fetch';

import { OAuth2Provider } from './OAuth2Provider';
import { AuthError } from './AuthError';
import { MODE_CONNECT } from './constants';

// See https://developers.google.com/identity/protocols/OpenIDConnect
const DISCOVERY_URL = 'https://accounts.google.com/.well-known/openid-configuration';

export class GoogleProvider extends OAuth2Provider {
  title = 'Google';

  async getAuthorizeURL(params) {
    const { authorization_endpoint } = await request(DISCOVERY_URL);
    this.authorizeURL = authorization_endpoint;
    return await super.getAuthorizeURL(params);
  }

  authorizeURLParams(commonParams, { display, mode }) {
    return {
      ...commonParams,
      scope:   'openid profile email',
      display: display || 'popup',
      prompt:  mode === MODE_CONNECT ? 'consent' : ''
    };
  }

  async fetchProfile(code, { params: { redirectURL } }) {
    const { token_endpoint, userinfo_endpoint } = await request(DISCOVERY_URL);

    const access_token = await this.fetchAccessToken(code, redirectURL, token_endpoint);

    try {
      const resp = await request(`${userinfo_endpoint}?access_token=${access_token}`);

      return {
        id:         resp.sub,
        fullName:   resp.name,
        nickName:   null,
        email:      resp.email,
        pictureURL: resp.picture,
      };
    } catch (err) {
      throw new AuthError(`Cannot fetch user profile: ${err.message}`);
    }
  }

  async fetchAccessToken(code, redirectURL, token_endpoint) {
    try {
      const params = {
        code,
        client_id:     this.clientId,
        client_secret: this.clientSecret,
        redirect_uri:  redirectURL,
        grant_type:    'authorization_code',
      };

      const { access_token } = await postRequest(token_endpoint, params);
      return access_token;
    } catch (err) {
      throw new AuthError(`Cannot obtain access token: ${err.message}`);
    }
  }
}

async function request(url) {
  const response = await fetch(url);
  let respBody = { error: { message: `HTTP error ${response.status}` } };

  try {
    respBody = await response.json();
  } catch (e) {
    // pass
  }

  if (respBody.error) {
    throw new Error(respBody.error.message);
  }

  return respBody;
}

async function postRequest(url, body) {
  const response = await fetch(url, {
    method:  'POST',
    body:    JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  let respBody = { error: { message: `HTTP error ${response.status}` } };

  try {
    respBody = await response.json();
  } catch (e) {
    // pass
  }

  if (respBody.error) {
    throw new Error(respBody.error.message);
  }

  return respBody;
}

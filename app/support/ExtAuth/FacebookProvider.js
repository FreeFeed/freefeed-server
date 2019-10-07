import { encode as qsEncode } from 'querystring';

import fetch from 'node-fetch';

import { OAuth2Provider } from './OAuth2Provider';
import { AuthError } from './AuthError';


const API_VERSION = 'v4.0';

export class FacebookProvider extends OAuth2Provider {
  title = 'Facebook';
  authorizeURL = `https://www.facebook.com/${API_VERSION}/dialog/oauth`;

  authorizeURLParams(commonParams, { display }) {
    return {
      ...commonParams,
      scope:   'public_profile,email',
      display: display || 'popup',
    };
  }

  async fetchProfile(code, { params: { redirectURL } }) {
    const access_token = await this.fetchAccessToken(code, redirectURL);

    try {
      const fields = 'name,email,picture';
      const resp = await request(
        `https://graph.facebook.com/${API_VERSION}/me?${qsEncode({ fields, access_token })}`
      );

      return {
        id:         resp.id,
        fullName:   resp.name,
        nickName:   null,
        email:      resp.email,
        pictureURL: resp.picture && resp.picture.data && resp.picture.data.url
      };
    } catch (err) {
      throw new AuthError(`Cannot fetch user profile: ${err.message}`);
    }
  }

  async fetchAccessToken(code, redirectURL) {
    try {
      const qs = {
        code,
        client_id:     this.clientId,
        client_secret: this.clientSecret,
        redirect_uri:  redirectURL
      };

      const { access_token } = await request(
        `https://graph.facebook.com/${API_VERSION}/oauth/access_token?${qsEncode(qs)}`
      );
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

import { encode as qsEncode } from 'querystring';

import { Cache } from './Cache';
import { AuthError } from './AuthError';
import { Provider } from './Provider';


export class OAuth2Provider extends Provider {
  title = 'Abstract OAuth2 Provider';
  authorizeURL;

  clientId;
  clientSecret;
  cache = new Cache('oauth2state:', 30 * 60); // 30 minutes

  constructor({ clientId, clientSecret }) {
    super();
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  async getAuthorizeURL(params) {
    const stateKey = await this.cache.put({ params });
    const urlParams = this.authorizeURLParams({
      'response_type': 'code',
      'client_id':     this.clientId,
      'redirect_uri':  params.redirectURL,
      'state':         stateKey,
    }, params);
    const join = this.authorizeURL.indexOf('?') !== -1 ? '&' : '?';
    return this.authorizeURL + join + qsEncode(urlParams);
  }

  async acceptResponse({ query }) {
    const stateKey = query.state;
    const state = await this.cache.get(stateKey);

    if (!state) {
      throw new AuthError('Invalid request state');
    }

    if (!query.code) {
      if (query.error_description) {
        throw new AuthError(query.error_description);
      } else if (query.error) {
        throw new AuthError(`Authorization error: ${query.error}`);
      } else {
        throw new AuthError(`Error: no authorization code in response`);
      }
    }

    state.profile = await this.fetchProfile(query.code, state);
    await this.cache.update(stateKey, state);

    return state;
  }

  // Protected methods
  authorizeURLParams(commonParams) {
    return commonParams;
  }

  fetchProfile() {
    throw new Error('Not implemented');
  }
}

import { encode as qsEncode } from 'querystring';

import { Adapter, AuthStartParams, AuthFinishParams, Profile } from './Adapter';
import { AuthError } from './AuthError';
import { Cache } from './Cache';
import { Query } from './OAuth2Adapter';


type TestParams = {
  externalId: string;
  externalName?: string;
  externalEmail?: string;
  externalPictureURL?: string;
}

/**
 * Use this provider for the test purposes only
 */
export class TestAdapter extends Adapter<Query, TestParams> {
  public readonly authorizeURL = 'https://example.com/authorize';
  private readonly cache = new Cache('oauth2state:', 30 * 60); // 30 minutes

  async getAuthorizeURL(startParams: AuthStartParams<TestParams>): Promise<string> {
    const stateKey = await this.cache.put<AuthStartParams<TestParams>>(startParams);
    return `${this.authorizeURL}?${qsEncode({ state: stateKey })}`;
  }

  async acceptResponse({ query }: AuthFinishParams<Query>): Promise<{
    params: AuthStartParams,
    profile: Profile,
  }> {
    const stateKey = query.state;
    const state = await this.cache.get<AuthStartParams<TestParams>>(stateKey);

    if (!state) {
      throw new AuthError('Invalid request state');
    }

    if ('error_description' in query) {
      throw new AuthError(query.error_description);
    } else if ('error' in query) {
      throw new AuthError(query.error);
    } else if (!('code' in query)) {
      throw new AuthError(`Error: no authorization code in response`);
    }

    return {
      params:  state,
      profile: {
        id:         state.externalId,
        name:       state.externalName || 'Test Test',
        email:      state.externalEmail || null,
        pictureURL: state.externalPictureURL || null,
      },
    };
  }
}

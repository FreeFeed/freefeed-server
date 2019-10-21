import { OAuth2Provider } from './OAuth2Provider';

/**
 * Use this provider for the test purposes only
 */
export class TestProvider extends OAuth2Provider {
  title = 'Example.com';
  authorizeURL = 'http://localhost/test-provider/authorize';

  fetchProfile(code, { params }) {
    // Emulate authorization error
    if (params.throwError) {
      throw new Error(params.throwError);
    }

    return {
      id:         params.externalId || '112233',
      fullName:   params.externalFullName || 'Test Test',
      nickName:   params.externalNickName || 'test',
      email:      params.externalEmail || null,
      pictureURL: params.externalPictureURL || null,
    };
  }
}

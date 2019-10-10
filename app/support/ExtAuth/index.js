import { load as configLoader } from '../../../config/config'

import { Cache } from './Cache';
import { TestProvider } from './TestProvider';
import { FacebookProvider } from './FacebookProvider';
import { GoogleProvider } from './GoogleProvider';


export {
  MODE_CONNECT,
  MODE_SIGN_IN,
  SIGN_IN_SUCCESS,
  SIGN_IN_USER_EXISTS,
  SIGN_IN_CONTINUE,
} from './constants';

export { AuthError } from './AuthError';

export { Cache } from './Cache';

// A separate cache that holds profile data to auto-connect after the user creation
export const profileCache = new Cache('extauthprofile:', 30 * 60); // 30 minutes

export function getAuthProvider(name) {
  const ProvClass = providerByName[name];
  const conf = configLoader().externalAuthProviders[name];

  if (!conf || !ProvClass) {
    return null;
  }

  return new ProvClass(conf);
}

const providerByName = {
  'test':     TestProvider,
  'facebook': FacebookProvider,
  'google':   GoogleProvider,
};

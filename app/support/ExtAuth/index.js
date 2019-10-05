import { load as configLoader } from '../../../config/config'

import { TestProvider } from './TestProvider';


export {
  MODE_CONNECT,
  MODE_SIGN_IN,
  SIGN_IN_SUCCESS,
  SIGN_IN_USER_EXISTS,
  SIGN_IN_CONTINUE,
} from './constants';

export { AuthError } from './AuthError';

const config = configLoader();

export function getAuthProvider(name) {
  const ProvClass = providerByName[name];
  const conf = config.externalAuthProviders[name];

  if (!conf || !ProvClass) {
    return null;
  }

  return new ProvClass(conf);
}

const providerByName = { 'test': TestProvider };

import config from 'config';
import { merge } from 'lodash';

import { Cache } from './Cache';
import { TestAdapter } from './TestAdapter';
import { OAuth2Adapter } from './OAuth2Adapter';

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

const templates = config.externalAuthTemplates;

export const allExternalProviders = config.externalAuthProviders.map(({ template, ...cfg }) => {
  if (template) {
    const tpl = templates[template];

    if (!tpl) {
      throw new Error(`Invalid server configuration: template '${template}' is not exists`);
    }

    return merge({}, cfg, tpl);
  }

  return cfg;
});

export function getAuthProvider(provId) {
  const conf = allExternalProviders.find((p) => p.id === provId);

  if (!conf) {
    return null;
  }

  const AdapterClass = adapterByName[conf.adapter];

  if (!AdapterClass) {
    return null;
  }

  return new AdapterClass(conf.params);
}

const adapterByName = {
  test: TestAdapter,
  oauth2: OAuth2Adapter,
};

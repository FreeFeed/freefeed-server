export class Provider {
  /**
   * Title must be overloaded in descendants.
   */
  title = 'Abstract Provider';

  /**
   * Constructor receives provider configuration from the
   * global config: `config.externalAuthProviders[providerName]`.
   *
   * @param {object} config
   */
  constructor(config) {} // eslint-disable-line no-unused-vars

  /**
   * getAuthorizeURL receives full JSON-parsed body of `auth-start` request
   * and returns URL to redirect user to.
   *
   * @param {object} params
   * @return {Promise<string>}
   */
  getAuthorizeURL(startParams) { // eslint-disable-line no-unused-vars
    throw Error('Not implemented');
  }

  /**
   * acceptResponse receives full JSON-parsed body of `auth-finish` request,
   * fetches external user profile and returns object of
   * ```
   * {
   *    params: startParams, // parameters of `getAuthorizeURL`
   *    profile: {
   *      id: ...         // ID on external service (string)
   *      fullName: ...   // full name on external service
   *      nickName: ...   // nick (system) name on external service or null
   *      email: ...      // email on external service or null
   *      pictureURL: ... // URL of avatar on external service or null
   *    }
   * }
   * ```
   *
   * @param {object} params
   * @return {Promise<object>}
   */
  acceptResponse(params) { // eslint-disable-line no-unused-vars
    throw Error('Not implemented');
  }

  /**
   * Performs cleanup after the authorization flow completes. Receives the
   * same parameters as the acceptResponse.
   *
   * @param {object} params
   * @return {Promise<void>}
   */
  done(params) {} // eslint-disable-line no-unused-vars
}

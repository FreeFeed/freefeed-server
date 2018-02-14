import { Strategy as LocalStrategy } from 'passport-local';
import FacebookStrategy from 'passport-facebook';
import GoogleStrategy from 'passport-google-oauth20';
import TwitterStrategy from 'passport-twitter';
import GithubStrategy from 'passport-github';
import { get, isString, isEmpty } from 'lodash';

import { dbAdapter, User, postgres } from '../../app/models';
import { load as configLoader } from '../../config/config';

const config = configLoader();

const {
  FACEBOOK_CLIENT_ID,
  FACEBOOK_CLIENT_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  TWITTER_CONSUMER_KEY,
  TWITTER_CONSUMER_SECRET,
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
} = process.env;

export function init(passport) {
  passport.use(new LocalStrategy({
    usernameField: 'username',
    passwordField: 'password'
  }, async (username, clearPassword, done) => {
    try {
      const user = await dbAdapter.getUserByUsername(username);

      if (!user) {
        // db inconsistency. got id, but didn't find object
        done({ message: 'We could not find the nickname you provided.' });
        return;
      }

      const valid = await user.validPassword(clearPassword);

      if (!valid) {
        done({ message: 'The password you provided does not match the password in our system.' });
        return;
      }

      done(null, user);
    } catch (e) {
      done({ message: 'We could not find the nickname you provided.' });
    }
  }));

  // Facebook
  passport.use(new FacebookStrategy(
    {
      clientID:          FACEBOOK_CLIENT_ID,
      clientSecret:      FACEBOOK_CLIENT_SECRET,
      callbackURL:       `${config.host}/auth/facebook/callback`,
      passReqToCallback: true,
      profileFields:     ['id', 'displayName', 'name', 'profileUrl', 'emails', 'photos']
    },
    getStrategyCallback('facebook')
  ));

  // Google
  // Enable Google+ api in app settings.
  passport.use(new GoogleStrategy(
    {
      clientID:          GOOGLE_CLIENT_ID,
      clientSecret:      GOOGLE_CLIENT_SECRET,
      callbackURL:       `${config.host}/auth/google/callback`,
      passReqToCallback: true,
    },
    getStrategyCallback('google')
  ));

  // Twitter
  // Enable "Request email addresses from users" in app settings.
  passport.use(new TwitterStrategy(
    {
      consumerKey:       TWITTER_CONSUMER_KEY,
      consumerSecret:    TWITTER_CONSUMER_SECRET,
      callbackURL:       `${config.host}/auth/twitter/callback`,
      passReqToCallback: true,
      includeEmail:      true,
    },
    getStrategyCallback('twitter')
  ));

  // Github
  passport.use(new GithubStrategy(
    {
      clientID:          GITHUB_CLIENT_ID,
      clientSecret:      GITHUB_CLIENT_SECRET,
      callbackURL:       `${config.host}/auth/github/callback`,
      passReqToCallback: true,
    },
    getStrategyCallback('github')
  ));
}

/**
 * Returns HTML with a script that calls window.oauthCallback of the parent window and closes the popup.
 */
function renderCallbackResponse({ profile, user, error }) {
  return (`<!DOCTYPE html>
<html>
  <head>
    <script>
      var profile = ${JSON.stringify(profile)};
      var user = ${JSON.stringify(user && user.toJSON())};
      var error = ${JSON.stringify(error && error.message)};
      if (window.opener) {
        window.opener.focus();

        if(window.opener.oauthCallback) {
          window.opener.oauthCallback({ profile: profile, user: user, error: error });
        }
      }
      window.close();
    </script>
  </head>
</html>`
  );
}

/**
 * Example:
 *  john.doe@gmail.com => johndoe{n}
 *  John Doe => john-doe{n}
 */
async function generateUsername({ firstName, secondName, email, username }) {
  async function userExists(username) {
    const user = await dbAdapter.getUserByUsername(username);
    !!user;
  }

  // TODO: Can a generated username fail the validation?
  let generatedUsername;
  if (isString(username)) {
    generatedUsername = username;
  } else if (isString(email)) {
    generatedUsername = email.split('@')[0]; // eslint-disable-line prefer-destructuring
  } else if (isString(firstName) && isString(secondName)) {
    generatedUsername = `${firstName}${secondName}`;
  } else {
    throw new Error(`Could not generate username`);
  }

  // eslint-disable-next-line no-await-in-loop
  for (let n = 1, old = generatedUsername; await userExists(generatedUsername); ++n) {
    generatedUsername = `${old}${n}`;
  }

  return generatedUsername;
}

/**
 * Returns a callback function for strategies.
 * Because passport-{provider} strategies accept callbacks with same signatures, and profile is
 * standard across different providers, it's possible to write a generalized callback function.
 * @param {String} strategyKey Represents a key in `users.providers`.
 */
function getStrategyCallback(strategyKey) {
  return async function findOrCreateUser(req, token, tokenSecret, profile, done) {
    // Don't create user, only respond with a profile.
    if (req.ctx.session.only_oauth_profile) {
      req.ctx.session.only_oauth_profile = false;
      req.ctx.body = renderCallbackResponse({ profile });
      done(null, null);
      return;
    }

    try {
      const email = get(profile, 'emails[0].value');
      // get by the provider user id
      let user = await dbAdapter.getUserByProviderId(strategyKey, profile.id);

      // or try to get by email
      if (!user && email) {
        user = await new User().where({ email }).fetch();
      }

      // add/update oauth profile
      if (user) {
        await dbAdapter.updateUser(user.id, {
          providers: {
            ...user.providers,
            [strategyKey]: profile
          }
        });
      }

      // TODO: Replace automatic creation with confirmation dialog? FreeFeed doesn't support users without a password.
      // if nothing was found, create a new account
      if (!user && email) {
        // TODO: Make transaction work.
        await postgres.transaction(async () => {
          const firstName = get(profile, 'name.givenName');
          const lastName = get(profile, 'name.familyName');
          let { displayName } = profile;

          if (isEmpty(displayName)) {
            if (!isEmpty(firstName) && !isEmpty(lastName)) {
              displayName = `${firstName} ${lastName}`;
            } else if (!isEmpty(firstName)) {
              displayName = firstName;
            } else {
              displayName = profile.username;
            }
          }

          // TODO: Generate password or make password optional
          user = await User.create({
            username: await generateUsername(
              {
                firstName,
                lastName,
                email,
                username: profile.username
              }
            ),
            screenName: displayName,
            email
          });

          await dbAdapter.updateUser(user.id, { providers: { [strategyKey]: profile } });
        });
      }

      if (user) {
        // TODO: Log in the user.
        // await req.ctx.login(user);
        // user = await user.refresh({ withRelated: USER_RELATIONS });
      }

      req.ctx.body = renderCallbackResponse({ profile, user });
      done(null, user);
    } catch (error) {
      req.ctx.app.logger.error(error);
      req.ctx.body = renderCallbackResponse({ profile, error });
      // passport doesn't need to know about the error. Callback must always respond with a script no matter what.
      done(null);
    }
  };
}

function getAuthParams(strategy) {
  const params = {};

  switch (strategy) {
    case 'facebook': {
      params.scope = ['email', 'public_profile'];
      break;
    }
    case 'google': {
      params.scope = ['email'];
      break;
    }
    case 'github': {
      params.scope = ['user:email'];
      break;
    }
    case 'twitter': {
      break;
    }
    default: throw new Error(`Unknown auth strategy '${strategy}'`);
  }

  return params;
}

/**
 * Returns a wrapping controller for passport.authenticate which logs in a user and
 * responds with a profile and the user.
 * It's possible to use this controller for:
 *   1. Creating a new user on the first login.
 *      Email must be present, otherwise a new user will not be created and the controller
 *      will only respond with a oauth profile.
 *   2. Adding a new authentication method to a user (if emails match).
 *   3. Logging in.
 *   4. Getting oauth profile without authenticating (set the `onlyProfile` option to true).
 */
export function getAuthController(strategy, passport, options = {}) {
  return function authController(ctx, next) {
    return passport.authenticate(strategy, getAuthParams(strategy), (error) => {
      //
      if (options.resetOnlyProfile) {
        Reflect.deleteProperty(ctx.session, 'only_oauth_profile');
      }

      // Process internal passport errors
      if (error) {
        ctx.body = renderCallbackResponse({ error });
      }
    })(ctx, next);
  };
}

export function getAuthProfileController(strategy, passport) {
  return function authController(ctx, next) {
    ctx.session.only_oauth_profile = true;

    return passport.authenticate(strategy, getAuthParams(strategy), (error) => {
      // Process internal passport errors
      if (error) {
        ctx.body = renderCallbackResponse({ error });
      }
    })(ctx, next);
  };
}

/**
 * Koa middleware for enforcing authentication.
 */
export function auth(ctx, next) {
  if (ctx.isUnauthenticated()) {
    ctx.status = 403;
    ctx.body = { error: 'api.errors.forbidden' };
    return null;
  }

  return next();
}


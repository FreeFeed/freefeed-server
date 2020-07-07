import { Strategy as LocalStrategy } from 'passport-local';

import { dbAdapter } from '../../models';


export function init(passport) {
  passport.use(new LocalStrategy({
    usernameField: 'username',
    passwordField: 'password'
  }, async (username, clearPassword, done) => {
    try {
      let user;

      if (username.indexOf('@') === -1) {
        user = await dbAdapter.getUserByUsername(username.trim());
      } else {
        user = await dbAdapter.getUserByEmail(username.trim());
      }

      if (!user?.isActive) {
        if (user?.isResumable) {
          done({
            message:     'Your account is now inactive but you can resume it.',
            userId:      user.id,
            isResumable: true,
          });
        } else {
          done({ message: 'We could not find the nickname you provided.' });
        }

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
}


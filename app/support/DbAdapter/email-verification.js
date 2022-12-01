import config from 'config';

import { createBase32Code, normalizeBase32Code } from '../base32-codes';
import { normalizeEmail } from '../email-norm';

const codesConfig = config.emailVerification.codes;

///////////////////////////////////////////////////
// Email verification
///////////////////////////////////////////////////

const emailVerificationTrait = (superClass) =>
  class extends superClass {
    /**
     * Create email verification code if limits allows. Returns null if limits
     * are over;
     *
     * @param {string} email
     * @param {string} ipAddress
     * @returns {Promise<string|null>}
     */
    async createEmailVerificationCode(email, ipAddress) {
      const emailNorm = normalizeEmail(email);

      // Checking limits
      {
        const { count, interval } = codesConfig.limitPerEmail;
        const sent = await this.database.getOne(
          `select coalesce(count(*), 0)::int from email_verification_codes where
            email_norm = :emailNorm 
            and created_at > now() - :interval * (interval '1 second')`,
          { emailNorm, interval },
        );

        if (sent >= count) {
          return null;
        }
      }

      {
        const { count, interval } = codesConfig.limitPerIP;
        const sent = await this.database.getOne(
          `select coalesce(count(*), 0)::int from email_verification_codes where
            creator_ip = :ipAddress 
            and created_at > now() - :interval * (interval '1 second')`,
          { ipAddress, interval },
        );

        if (sent >= count) {
          return null;
        }
      }

      // Creating code
      const code = createBase32Code(6);
      await this.database.raw(
        `insert into email_verification_codes
        (code, email, email_norm, creator_ip, expires_at) 
        values
        (:code, :email, :emailNorm, :ipAddress, now() + :ttl * (interval '1 second'))`,
        { code, email, emailNorm, ipAddress, ttl: codesConfig.TTL },
      );
      return code;
    }

    /**
     * Checks the verification code and and deletes it if correct
     *
     * @param {string} code
     * @param {string} email
     * @returns {Promise<boolean>}
     */
    async checkEmailVerificationCode(code, email) {
      code = normalizeBase32Code(code, 6);

      if (!code) {
        return false;
      }

      const ok = await this.database.getOne(
        `delete from email_verification_codes
          where code = :code and email = :email and expires_at > now()
          returning true`,
        { code, email },
      );

      return !!ok;
    }

    async cleanOldEmailVerificationCodes() {
      await this.database.raw(`delete from email_verification_codes where expires_at < now()`);
    }
  };

export default emailVerificationTrait;

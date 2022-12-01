/* eslint-env node, mocha */
/* global $pg_database */
import config from 'config';
import expect from 'unexpected';
import { simpleParser } from 'mailparser';

import { addMailListener } from '../../lib/mailer';
import cleanDB from '../dbCleaner';
import { dbAdapter } from '../../app/models';

import { performJSONRequest } from './functional_test_helper';

const codesConfig = config.emailVerification.codes;

describe('Email verification', () => {
  beforeEach(() => cleanDB($pg_database));

  let capturedMail = null;
  let removeMailListener = () => null;
  before(() => (removeMailListener = addMailListener((r) => (capturedMail = r))));
  after(removeMailListener);
  beforeEach(() => (capturedMail = null));

  it(`should return error if email address is not valid`, async () => {
    const resp = await performJSONRequest('POST', `/v2/users/verifyEmail`, { email: 'foo' });
    expect(resp, 'to satisfy', { __httpCode: 422 });
  });

  it(`should not send too many emails`, async () => {
    const email = 'foo@bar.baz';
    const limit = codesConfig.limitPerEmail.count;

    for (let i = 0; i < limit; i++) {
      // eslint-disable-next-line no-await-in-loop
      const resp = await performJSONRequest('POST', `/v2/users/verifyEmail`, { email });
      expect(resp, 'to satisfy', { __httpCode: 200 });
    }

    const resp = await performJSONRequest('POST', `/v2/users/verifyEmail`, { email });
    expect(resp, 'to satisfy', { __httpCode: 429 });
  });

  it(`should send email with code`, async () => {
    const email = 'foo@bar.baz';
    const resp = await performJSONRequest('POST', `/v2/users/verifyEmail`, { email });
    expect(resp, 'to satisfy', { __httpCode: 200 });

    expect(capturedMail, 'to satisfy', { envelope: { to: [email] } });
    const parsedMail = await simpleParser(capturedMail.response);
    const [, code] = /code: (\w+)$/.exec(parsedMail.subject);

    // Check it in database
    let exists = await dbAdapter.checkEmailVerificationCode(code, email);
    expect(exists, 'to be true');

    // Should not exists after the first check
    exists = await dbAdapter.checkEmailVerificationCode(code, email);
    expect(exists, 'to be false');
  });
});

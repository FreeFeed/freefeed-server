/* eslint-env node, mocha */
import config from 'config';
import expect from 'unexpected';
import { render as renderEJS } from 'ejs';
import { simpleParser } from 'mailparser';

import {
  renderSummaryBody,
  sendDailyBestOfEmail,
  sendWeeklyBestOfEmail,
} from '../../../app/mailers/BestOfDigestMailer';
import { addMailListener } from '../../../lib/mailer';

describe('BestOfDigests', () => {
  describe('renderSummaryBody', () => {
    it(`should render a summary body and doesn't blow up`, async () => {
      const body = await renderSummaryBody({ posts: [] });
      expect(body, 'to contain', '<style>');
      expect(body, 'to contain', '<div class="posts"></div>');
    });
  });

  describe('sendBestOfEmail', () => {
    let capturedMail = null;
    let removeMailListener = () => null;

    before(() => {
      removeMailListener = addMailListener((r) => (capturedMail = r));
    });
    after(removeMailListener);

    it(`should send daily best of email and doesn't blow up`, async () => {
      const digestDate = 'April 1st';
      const data = { posts: [] };
      const user = { email: 'luna@example.com' };

      await sendDailyBestOfEmail(user, data, digestDate);

      expect(capturedMail, 'to satisfy', { envelope: { to: [user.email] } });
      const parsedMail = await simpleParser(capturedMail.response);
      expect(parsedMail, 'to satisfy', {
        subject: renderEJS(config.mailer.dailyBestOfDigestMailSubject, { digestDate }),
        html: expect.it('to contain', '<div class="posts"></div>'),
      });
    });

    it(`should send weekly best of email and doesn't blow up`, async () => {
      const digestDate = 'April 1st';
      const data = { posts: [] };
      const user = { email: 'luna@example.com' };

      await sendWeeklyBestOfEmail(user, data, digestDate);

      expect(capturedMail, 'to satisfy', { envelope: { to: [user.email] } });
      const parsedMail = await simpleParser(capturedMail.response);
      expect(parsedMail, 'to satisfy', {
        subject: renderEJS(config.mailer.weeklyBestOfDigestMailSubject, { digestDate }),
        html: expect.it('to contain', '<div class="posts"></div>'),
      });
    });
  });
});

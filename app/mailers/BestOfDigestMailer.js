import { promisifyAll } from 'bluebird';
import createDebug from 'debug';
import { default as juice } from 'juice';
import Mailer from '../../lib/mailer';
import { load as configLoader } from '../../config/config';
import { renderToString } from '../views/emails/best-of-digest/SummaryEmail.jsx';

promisifyAll(juice);

const config = configLoader();

export async function sendDailyBestOfEmail(user, data, digestDate) {
  const debug = createDebug('freefeed:BestOfDigestMailer');

  // TODO: const subject = config.mailer.dailyBestOfDigestEmailSubject
  const emailBody = renderToString(data);
  const emailBodyWithInlineStyles = await juice.juiceResourcesAsync(emailBody, (err, html) => {
    debug('Error occured while trying to inline styles', err, html);
  });

  return Mailer.sendMail(user, `The best of your FreeFeed for ${digestDate}`, {
    digest: {
      body: emailBodyWithInlineStyles,
      date: digestDate
    },
    recipient: user,
    baseUrl:   config.host,
  }, `${config.appRoot}/app/scripts/views/mailer/dailyBestOfDigest.ejs`, true);
}

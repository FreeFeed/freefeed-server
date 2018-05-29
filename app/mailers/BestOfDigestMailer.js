import { promisifyAll } from 'bluebird';
import createDebug from 'debug';
import { default as juice } from 'juice';
import ReactDOMServer from 'react-dom/server';
import Mailer from '../../lib/mailer';
import { load as configLoader } from '../../config/config';
import { SummaryEmail } from '../views/emails/best-of-digest/SummaryEmail.jsx';
import { fa } from '../views/emails/best-of-digest/assets/font-awesome-base64';

promisifyAll(juice);

const config = configLoader();

export async function sendDailyBestOfEmail(user, data, digestDate) {
  const debug = createDebug('freefeed:BestOfDigestMailer');

  // TODO: const subject = config.mailer.dailyBestOfDigestEmailSubject
  const emailBody = ReactDOMServer.renderToStaticMarkup(SummaryEmail(data));
  const emailBodyWithInlineStyles = await juice.juiceResourcesAsync(emailBody, (err, html) => {
    debug('Error occurred while trying to inline styles', err, html);
  });

  const attachments = [fa['fa-heart'], fa['fa-lock'], fa['fa-comment-o'], fa['post-protected']];

  return Mailer.sendMail(user, `The best of your FreeFeed for ${digestDate}`, {
    digest: {
      body: emailBodyWithInlineStyles,
      date: digestDate
    },
    recipient: user,
    baseUrl:   config.host,
  }, `${config.appRoot}/app/scripts/views/mailer/dailyBestOfDigest.ejs`, true, attachments);
}

export async function sendWeeklyBestOfEmail(user, data, digestDate) {
  const debug = createDebug('freefeed:BestOfDigestMailer');

  // TODO: const subject = config.mailer.weeklyBestOfDigestEmailSubject
  const emailBody = ReactDOMServer.renderToStaticMarkup(SummaryEmail(data));
  const emailBodyWithInlineStyles = await juice.juiceResourcesAsync(emailBody, (err, html) => {
    debug('Error occurred while trying to inline styles', err, html);
  });

  const attachments = [fa['fa-heart'], fa['fa-lock']];

  return Mailer.sendMail(user, `The best of your FreeFeed for the week of ${digestDate}`, {
    digest: {
      body: emailBodyWithInlineStyles,
      date: digestDate
    },
    recipient: user,
    baseUrl:   config.host,
  }, `${config.appRoot}/app/scripts/views/mailer/weeklyBestOfDigest.ejs`, true, attachments);
}

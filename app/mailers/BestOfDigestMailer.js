import util from 'util';

import createDebug from 'debug';
import { juiceResources } from 'juice';
import ReactDOMServer from 'react-dom/server';
import config from 'config';

import Mailer from '../../lib/mailer';
import { SummaryEmail } from '../views/emails/best-of-digest/SummaryEmail.jsx';
import { fa } from '../views/emails/best-of-digest/assets/font-awesome-base64';

const juiceResourcesAsync = util.promisify(juiceResources);

export async function sendDailyBestOfEmail(user, data, digestDate) {
  const debug = createDebug('freefeed:BestOfDigestMailer');

  // TODO: const subject = config.mailer.dailyBestOfDigestEmailSubject
  const emailBody = ReactDOMServer.renderToStaticMarkup(SummaryEmail(data));
  let emailBodyWithInlineStyles;

  try {
    emailBodyWithInlineStyles = await juiceResourcesAsync(emailBody, {});
  } catch (err) {
    debug('Error occurred while trying to inline styles', err);
    return;
  }

  const attachments = [
    fa['fa-heart'],
    fa['fa-lock'],
    fa['fa-comment-o'],
    fa['post-protected'],
    fa['fa-chevron-right'],
  ];

  await Mailer.sendMail(
    user,
    `The best of your ${config.siteTitle} for ${digestDate}`,
    {
      digest: {
        body: emailBodyWithInlineStyles,
        date: digestDate,
      },
      recipient: user,
      baseUrl: config.host,
      mailerConfig: { subjectTransformation: (subject) => subject },
    },
    `${config.appRoot}/app/scripts/views/mailer/dailyBestOfDigest.ejs`,
    true,
    attachments,
  );
}

export async function sendWeeklyBestOfEmail(user, data, digestDate) {
  const debug = createDebug('freefeed:BestOfDigestMailer');

  // TODO: const subject = config.mailer.weeklyBestOfDigestEmailSubject
  const emailBody = ReactDOMServer.renderToStaticMarkup(SummaryEmail(data));
  let emailBodyWithInlineStyles;

  try {
    emailBodyWithInlineStyles = await juiceResourcesAsync(emailBody, {});
  } catch (err) {
    debug('Error occurred while trying to inline styles', err);
    return;
  }

  const attachments = [
    fa['fa-heart'],
    fa['fa-lock'],
    fa['fa-comment-o'],
    fa['post-protected'],
    fa['fa-chevron-right'],
  ];

  await Mailer.sendMail(
    user,
    `The best of your ${config.siteTitle} for the week of ${digestDate}`,
    {
      digest: {
        body: emailBodyWithInlineStyles,
        date: digestDate,
      },
      recipient: user,
      baseUrl: config.host,
      mailerConfig: { subjectTransformation: (subject) => subject },
    },
    `${config.appRoot}/app/scripts/views/mailer/weeklyBestOfDigest.ejs`,
    true,
    attachments,
  );
}

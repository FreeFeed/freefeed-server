import Mailer from '../../lib/mailer';
import { load as configLoader } from '../../config/config';

const config = configLoader();

export function sendDailyBestOfEmail(user, data, digestDate) {
  // TODO: const subject = config.mailer.dailyBestOfDigestEmailSubject
  const emailBody = JSON.stringify(data);

  return Mailer.sendMail(user, `The best of your FreeFeed for ${digestDate}`, {
    digest: {
      body: emailBody,
      date: digestDate
    },
    recipient: user,
    baseUrl:   config.host,
  }, `${config.appRoot}/app/scripts/views/mailer/dailyBestOfDigest.ejs`, true);
}

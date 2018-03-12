import moment from 'moment';
import createDebug from 'debug';
import Router from 'koa-router';

import { dbAdapter } from '../models';
import { sendDailyBestOfEmail } from '../mailers/BestOfDigestMailer';
import TimelinesController from '../controllers/api/v2/TimelinesController.js';


export async function sendBestOfEmails() {
  const debug = createDebug('freefeed:sendBestOfEmails');

  const users = await dbAdapter.getDailyBestOfDigestRecipients();
  debug(`getDailyBestOfDigestRecipients returned ${users.length} records`);

  const emailsSentAt = await dbAdapter.getDailyBestOfEmailSentAt(users.map((u) => u.intId));

  const router = new Router();
  const timelinesController = new TimelinesController(router);

  const promises = users.map(async (u) => {
    const digestSentAt = emailsSentAt[u.intId];
    if (!shouldSendDailyBestOfDigest(digestSentAt)) {
      debug(`[${u.username}] shouldSendDailyBestOfDigest() returned falsy value: SKIP`);
      return;
    }

    const ctx = {
      request: { query: {} },
      state:   { user: u }
    };

    await timelinesController.bestOf(ctx);

    const digestDate = moment().format('MMMM Do YYYY');

    await sendDailyBestOfEmail(u, ctx.body, digestDate);

    debug(`[${u.username}] email is queued: OK`);

    await dbAdapter.addSentEmailLogEntry(u.intId, u.email, 'daily_best_of');
    debug(`[${u.username}] added entry to sent_emails_log`);
  });

  debug('waiting for all promised actions to finish');
  await Promise.all(promises);
  debug('all promised actions are finished');
}

function shouldSendDailyBestOfDigest(digestSentAt) {
  const wrappedDigestSentAt = moment(digestSentAt);
  const wrappedNow = moment();
  const dayAgo = wrappedNow.clone().subtract(1, 'days').add(30, 'minutes');

  return wrappedDigestSentAt.isBefore(dayAgo);
}

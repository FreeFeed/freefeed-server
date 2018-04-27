import moment from 'moment';
import createDebug from 'debug';
import _ from 'lodash';

import { dbAdapter } from '../models';
import { sendDailyBestOfEmail } from '../mailers/BestOfDigestMailer';
import { generalSummary } from '../controllers/api/v2/SummaryController.js';


export async function sendBestOfEmails() {
  const debug = createDebug('freefeed:sendBestOfEmails');

  const users = await dbAdapter.getDailyBestOfDigestRecipients();
  debug(`getDailyBestOfDigestRecipients returned ${users.length} records`);

  const emailsSentAt = await dbAdapter.getDailyBestOfEmailSentAt(users.map((u) => u.intId));

  const promises = users.map(async (u) => {
    const digestSentAt = emailsSentAt[u.intId];
    if (!shouldSendDailyBestOfDigest(digestSentAt)) {
      debug(`[${u.username}] shouldSendDailyBestOfDigest() returned falsy value: SKIP`);
      return;
    }

    const ctx = {
      request: { query: {} },
      state:   { user: u },
      params:  { days: 1 }
    };

    await generalSummary(ctx);

    const digestDate = moment().format('MMMM Do YYYY');

    const preparedPayload = preparePosts(ctx.body);
    await sendDailyBestOfEmail(u, preparedPayload, digestDate);

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

function preparePosts(payload, user) {
  for (const post of payload.posts) {
    post.createdBy = payload.users.find((user) => user.id === post.createdBy);
    post.recipients = post.postedTo
      .map((subscriptionId) => {
        const userId = (payload.subscriptions[subscriptionId] || {}).user;
        const subscriptionType = (payload.subscriptions[subscriptionId] || {}).name;
        const isDirectToSelf = userId === post.createdBy.id && subscriptionType === 'Directs';
        return !isDirectToSelf ? userId : false;
      })
      .map((userId) => payload.subscribers[userId])
      .filter((user) => user);

    post.attachments = _(post.attachments || []).map((attachmentId) => {
      return payload.attachments.find((att) => att.id === attachmentId);
    }).value();

    post.usersLikedPost = _(post.likes || []).map((userId) => {
      return payload.users.find((user) => user.id === userId);
    }).value();

    post.comments = _(post.comments || []).map((commentId) => {
      const comment = payload.comments.find((comment) => comment.id === commentId);
      comment.createdBy = payload.users.find((user) => user.id === comment.createdBy);
      return comment;
    }).value();
  }

  payload.user = user;
  return payload;
}

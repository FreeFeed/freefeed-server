import moment from 'moment';
import createDebug from 'debug';
import _ from 'lodash';

import { dbAdapter } from '../models';
import { sendDailyBestOfEmail } from '../mailers/BestOfDigestMailer';
import { generalSummary } from '../controllers/api/v2/SummaryController.js';


export async function sendBestOfEmails() {
  const debug = createDebug('freefeed:sendBestOfEmails');

  const dailyDigestRecipients = await dbAdapter.getDailyBestOfDigestRecipients();
  debug(`getDailyBestOfDigestRecipients returned ${dailyDigestRecipients.length} records`);

  const dailyEmailsSentAt = await dbAdapter.getDailyBestOfEmailSentAt(dailyDigestRecipients.map((u) => u.intId));

  const dailyDigestPromises = dailyDigestRecipients.map(async (u) => {
    const digestSentAt = dailyEmailsSentAt[u.intId];
    if (!shouldSendDailyBestOfDigest(digestSentAt)) {
      debug(`[${u.username}] shouldSendDailyBestOfDigest() returned falsy value: SKIP`);
      return;
    }

    const digestDate = moment().format('MMMM Do YYYY');

    const dailySummary = await getSummary(u, 1);
    if (!dailySummary.posts.length) {
      debug(`[${u.username}] getSummary() returned 0 posts: SKIP`);
      return;
    }
    await sendDailyBestOfEmail(u, dailySummary, digestDate);

    debug(`[${u.username}] email is queued: OK`);

    await dbAdapter.addSentEmailLogEntry(u.intId, u.email, 'daily_best_of');
    debug(`[${u.username}] added entry to sent_emails_log`);
  });

  debug('waiting for all promised actions to finish');
  await Promise.all(dailyDigestPromises);
  debug('all promised actions are finished');
}

export function shouldSendDailyBestOfDigest(digestSentAt, now) {
  const wrappedDigestSentAt = moment(digestSentAt || 0);
  const wrappedNow = moment(now);
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

async function getSummary(user, days) {
  const ctx = {
    request: { query: {} },
    state:   { user },
    params:  { days }
  };

  await generalSummary(ctx);
  if (!ctx.body.posts.length) {
    return ctx.body;
  }
  return preparePosts(ctx.body, user);
}

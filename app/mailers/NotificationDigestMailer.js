import moment from 'moment';
import createDebug from 'debug';
import config from 'config';
import { render as renderEJS } from 'ejs';

import Mailer from '../../lib/mailer';

const debug = createDebug('freefeed:sendEmails');

export function sendEventsDigestEmail(user, { events, users, groups }, digestInterval) {
  const emailBody = events
    .map((event) => getEventText(event, users, groups))
    .filter(Boolean)
    .map((text) => getEventMarkup(text))
    .join('\n');

  return Mailer.sendMail(
    user,
    renderEJS(config.mailer.notificationDigestEmailSubject, { digestInterval }),
    {
      digest: {
        body: emailBody,
        interval: digestInterval,
      },
      recipient: user,
      baseUrl: config.host,
    },
    `${config.appRoot}/app/scripts/views/mailer/notificationsDigest.ejs`,
    true,
  );
}

export function getEventText(event, users, groups) {
  const eventData = getEventPayload(event, users, groups);
  const template = notificationTemplates[event.event_type];

  if (template) {
    return template(eventData);
  }

  debug(`Template not found for event type ${event.event_type}`);
  return null;
}

function getEventPayload(event, users, groups) {
  const recipient = users.find((u) => u.id === event.recipient_user_id);
  const creator = users.find((u) => u.id === event.created_user_id);
  const affectedUser = users.find((u) => u.id === event.affected_user_id);
  const postAuthor = users.find((u) => u.id === event.post_author_id);
  const group = groups.find((g) => g.id === event.group_id);
  return {
    recipient,
    creator,
    affectedUser,
    postAuthor,
    commentId: event.comment_id,
    postId: event.post_id,
    group,
    createdAt: moment(event.date),
    targetPostId: event.target_post_id,
    targetCommentId: event.target_comment_id,
  };
}

const notificationTemplates = {
  mention_in_post: (eventData) => {
    const postAuthorLink = makeUserLink(eventData.postAuthor);
    const postLink = makePostLink(eventData.postId, eventData.postAuthor);
    const groupLink = eventData.group ? makeUserLink(eventData.group) : null;
    const eventTime = eventData.createdAt.format('HH:MM');
    return `
      ${postAuthorLink} mentioned you in the ${postLink}${
        groupLink ? ` [in ${groupLink}]` : ''
      }<br />
      ${eventTime}
    `;
  },
  mention_in_comment: (eventData) => {
    const commentAuthorLink = makeUserLink(eventData.creator);
    const postLink = makePostLink(eventData.postId, eventData.postAuthor);
    const commentLink = makeCommentLink(
      eventData.postId,
      eventData.commentId,
      eventData.postAuthor,
      'comment',
    );
    const groupLink = eventData.group ? makeUserLink(eventData.group) : null;
    const eventTime = eventData.createdAt.format('HH:MM');
    return `
      ${commentAuthorLink} mentioned you in a ${commentLink} to the ${postLink}${
        groupLink ? ` [in ${groupLink}]` : ''
      }<br />
      ${eventTime}
    `;
  },
  backlink_in_post: (eventData) => {
    const postAuthorLink = makeUserLink(eventData.postAuthor);
    const postLink = makePostLink(eventData.postId, eventData.postAuthor);
    const groupLink = eventData.group ? makeUserLink(eventData.group) : null;
    const eventTime = eventData.createdAt.format('HH:MM');
    const backlinkLink = makeBacklinkLink(eventData);
    return `
      ${postAuthorLink} mentioned your ${backlinkLink} in the ${postLink}${
        groupLink ? ` [in ${groupLink}]` : ''
      }<br />
      ${eventTime}
    `;
  },
  backlink_in_comment: (eventData) => {
    const commentAuthorLink = makeUserLink(eventData.creator);
    const postLink = makePostLink(eventData.postId, eventData.postAuthor);
    const commentLink = makeCommentLink(
      eventData.postId,
      eventData.commentId,
      eventData.postAuthor,
      'comment',
    );
    const groupLink = eventData.group ? makeUserLink(eventData.group) : null;
    const eventTime = eventData.createdAt.format('HH:MM');
    const backlinkLink = makeBacklinkLink(eventData);
    return `
      ${commentAuthorLink} mentioned your ${backlinkLink} in a ${commentLink} to the ${postLink}${
        groupLink ? ` [in ${groupLink}]` : ''
      }<br />
      ${eventTime}
    `;
  },
  mention_comment_to: (eventData) => {
    const commentAuthorLink = makeUserLink(eventData.creator);
    const postLink = makePostLink(eventData.postId, eventData.postAuthor);
    const commentLink = makeCommentLink(
      eventData.postId,
      eventData.commentId,
      eventData.postAuthor,
      'replied',
    );
    const groupLink = eventData.group ? makeUserLink(eventData.group) : null;
    const eventTime = eventData.createdAt.format('HH:MM');
    return `
      ${commentAuthorLink} ${commentLink} to you in the  ${postLink}${
        groupLink ? ` [in ${groupLink}]` : ''
      }<br />
      ${eventTime}
    `;
  },
  direct: (eventData) => {
    const postAuthorLink = makeUserLink(eventData.postAuthor);
    const postLink = makePostLink(eventData.postId, eventData.postAuthor, true);
    const eventTime = eventData.createdAt.format('HH:MM');
    return `
      You received a ${postLink} from ${postAuthorLink}<br />
      ${eventTime}
    `;
  },
  direct_comment: (eventData) => {
    const postAuthorLink = makeUserLink(eventData.postAuthor);
    const postLink = makePostLink(eventData.postId, eventData.postAuthor, true);
    const commentLink = makeCommentLink(
      eventData.postId,
      eventData.commentId,
      eventData.postAuthor,
      'comment',
    );
    const eventTime = eventData.createdAt.format('HH:MM');
    return `
      New ${commentLink} was posted to a ${postLink} from ${postAuthorLink}<br />
      ${eventTime}
    `;
  },
  post_comment: (eventData) => {
    const postAuthorLink = makeUserLink(eventData.postAuthor);
    const postLink = makePostLink(eventData.postId, eventData.postAuthor, false);
    const commentLink = makeCommentLink(
      eventData.postId,
      eventData.commentId,
      eventData.postAuthor,
      'comment',
    );
    const eventTime = eventData.createdAt.format('HH:MM');
    return `
      New ${commentLink} was posted to a ${postLink} from ${postAuthorLink}<br />
      ${eventTime}
    `;
  },
  subscription_requested: (eventData) => {
    const subscriberLink = makeUserLink(eventData.creator);
    const eventTime = eventData.createdAt.format('HH:MM');
    return `
      ${subscriberLink} sent you a subscription request<br />
      ${eventTime}
    `;
  },
  user_subscribed: (eventData) => {
    const subscriberLink = makeUserLink(eventData.creator);
    const eventTime = eventData.createdAt.format('HH:MM');
    return `
      ${subscriberLink} subscribed to your feed<br />
      ${eventTime}
    `;
  },
  user_unsubscribed: () => {
    return '';
  },
  subscription_request_approved: (eventData) => {
    const approverLink = makeUserLink(eventData.creator);
    const eventTime = eventData.createdAt.format('HH:MM');
    return `
      Your subscription request to ${approverLink} was approved<br />
      ${eventTime}
    `;
  },
  subscription_request_rejected: (eventData) => {
    const rejecterLink = makeUserLink(eventData.creator);
    const eventTime = eventData.createdAt.format('HH:MM');
    return `
      Your subscription request to ${rejecterLink} was rejected<br />
      ${eventTime}
    `;
  },
  subscription_request_revoked: (eventData) => {
    const revokerLink = makeUserLink(eventData.creator);
    const eventTime = eventData.createdAt.format('HH:MM');
    return `
      ${revokerLink} revoked subscription request to you<br />
      ${eventTime}
    `;
  },
  group_subscription_requested: (eventData) => {
    const requesterLink = makeUserLink(eventData.creator);
    const groupLink = makeUserLink(eventData.group);
    const eventTime = eventData.createdAt.format('HH:MM');
    return `
      ${requesterLink} sent a subscription request to join ${groupLink} that you admin<br />
      ${eventTime}
    `;
  },
  group_admin_promoted: (eventData) => {
    const adminUserLink = makeUserLink(eventData.creator);
    const affectedUserLink = makeUserLink(eventData.affectedUser);
    const groupLink = makeUserLink(eventData.group);
    const eventTime = eventData.createdAt.format('HH:MM');
    return `
      ${adminUserLink} promoted ${affectedUserLink} to admin in the group ${groupLink}<br />
      ${eventTime}
    `;
  },
  group_admin_demoted: (eventData) => {
    const adminUserLink = makeUserLink(eventData.creator);
    const affectedUserLink = makeUserLink(eventData.affectedUser);
    const groupLink = makeUserLink(eventData.group);
    const eventTime = eventData.createdAt.format('HH:MM');
    return `
      ${adminUserLink} revoked admin privileges from ${affectedUserLink} in group ${groupLink}<br />
      ${eventTime}
    `;
  },
  managed_group_subscription_approved: (eventData) => {
    const adminUserLink = makeUserLink(eventData.creator);
    const affectedUserLink = makeUserLink(eventData.affectedUser);
    const groupLink = makeUserLink(eventData.group);
    const eventTime = eventData.createdAt.format('HH:MM');
    return `
      ${affectedUserLink} subscription request to join ${groupLink} was approved by ${adminUserLink}<br />
      ${eventTime}
    `;
  },
  managed_group_subscription_rejected: (eventData) => {
    const affectedUserLink = makeUserLink(eventData.affectedUser);
    const groupLink = makeUserLink(eventData.group);
    const eventTime = eventData.createdAt.format('HH:MM');
    return `
      ${affectedUserLink} subscription request to join ${groupLink} was rejected<br />
      ${eventTime}
    `;
  },
  group_subscription_approved: (eventData) => {
    const groupLink = makeUserLink(eventData.group);
    const eventTime = eventData.createdAt.format('HH:MM');
    return `
      Your request to join group ${groupLink} was approved<br />
      ${eventTime}
    `;
  },
  group_subscription_request_revoked: (eventData) => {
    const requesterLink = makeUserLink(eventData.creator);
    const groupLink = makeUserLink(eventData.group);
    const eventTime = eventData.createdAt.format('HH:MM');
    return `
      ${requesterLink} revoked subscription request to ${groupLink}<br />
      ${eventTime}
    `;
  },
  group_subscription_rejected: (eventData) => {
    const groupLink = makeUserLink(eventData.group);
    const eventTime = eventData.createdAt.format('HH:MM');
    return `
      Your request to join group ${groupLink} was rejected<br />
      ${eventTime}
    `;
  },
  group_subscribed: (eventData) => {
    const subscriberLink = makeUserLink(eventData.creator);
    const groupLink = makeUserLink(eventData.group);
    const eventTime = eventData.createdAt.format('HH:MM');
    return `
      ${subscriberLink} subscribed to ${groupLink}<br />
      ${eventTime}
    `;
  },
  group_unsubscribed: (eventData) => {
    const unsubscriberLink = makeUserLink(eventData.creator);
    const groupLink = makeUserLink(eventData.group);
    const eventTime = eventData.createdAt.format('HH:MM');
    return `
      ${unsubscriberLink} unsubscribed from ${groupLink}<br />
      ${eventTime}
    `;
  },
  direct_left: (eventData) => {
    const creatorHTML =
      eventData.recipient.id === eventData.creator.id ? 'You' : makeUserLink(eventData.creator);
    const postAuthorHTML =
      eventData.recipient.id === eventData.postAuthor.id
        ? 'you'
        : makeUserLink(eventData.postAuthor);
    const postHTML =
      eventData.recipient.id === eventData.creator.id
        ? 'direct message'
        : makePostLink(eventData.postId, eventData.postAuthor, true);

    return `${creatorHTML} left a ${postHTML} created by ${postAuthorHTML}`;
  },

  blocked_in_group: (eventData) => {
    let adminHTML = 'Group admin';

    if (eventData.creator) {
      adminHTML =
        eventData.recipient.id === eventData.creator.id ? 'You' : makeUserLink(eventData.creator);
    }

    const victimHTML =
      eventData.recipient.id === eventData.affectedUser.id
        ? 'You'
        : makeUserLink(eventData.affectedUser);
    const groupLink = makeUserLink(eventData.group);

    return `${adminHTML} blocked ${victimHTML} in group ${groupLink}`;
  },

  unblocked_in_group: (eventData) => {
    let adminHTML = 'Group admin';

    if (eventData.creator) {
      adminHTML =
        eventData.recipient.id === eventData.creator.id ? 'You' : makeUserLink(eventData.creator);
    }

    const victimHTML =
      eventData.recipient.id === eventData.affectedUser.id
        ? 'You'
        : makeUserLink(eventData.affectedUser);
    const groupLink = makeUserLink(eventData.group);

    return `${adminHTML} unblocked ${victimHTML} in group ${groupLink}`;
  },

  bans_in_group_disabled: (eventData) => {
    const isSelf = eventData.recipient.id === eventData.creator.id;
    return `${isSelf ? makeUserLink(eventData.creator) : 'You'} disabled the bans ${
      isSelf ? 'for yourself' : 'for you'
    } in group ${makeUserLink(eventData.group)}`;
  },

  bans_in_group_enabled: (eventData) => {
    const isSelf = eventData.recipient.id === eventData.creator.id;
    return `${isSelf ? makeUserLink(eventData.creator) : 'You'} enabled the bans ${
      isSelf ? 'for yourself' : 'for you'
    } in group ${makeUserLink(eventData.group)}`;
  },
};

function makeUserLink(user) {
  return user
    ? `<a href="${config.host}/${user.username}" style="color:#555599;">@${user.username}</a>`
    : 'unknown user';
}

function makePostLink(postId, postAuthor, isDirect = false) {
  if (!postId || !postAuthor) {
    return `deleted ${isDirect ? 'direct message' : 'post'}`;
  }

  const postLink = `${config.host}/${postAuthor.username}/${postId}`;
  return `<a href="${postLink}" style="color:#555599;">${isDirect ? 'direct message' : 'post'}</a>`;
}

function makeCommentLink(postId, commentId, postAuthor, linkText) {
  if (!postId || !postAuthor || !commentId) {
    return `${linkText} (deleted)`;
  }

  const postLink = `${config.host}/${postAuthor.username}/${postId}#comment-${commentId}`;
  return `<a href="${postLink}" style="color:#555599;">${linkText}</a>`;
}

function getEventMarkup(eventText) {
  return `<tr style="font-family: 'Helvetica Neue',Helvetica,Arial,sans-serif; box-sizing: border-box; font-size: 14px; margin: 0;">
      <td class="content-block" style="font-family: 'Helvetica Neue',Helvetica,Arial,sans-serif; box-sizing: border-box; font-size: 14px; vertical-align: top; margin: 0; padding: 0 0 20px;" valign="top">

          ${eventText}
      </td>
  </tr>`;
}

function makeBacklinkLink({ targetPostId, targetCommentId }) {
  if (targetCommentId) {
    return `<a href="${config.host}/post/${targetPostId}#comment-${targetCommentId}">comment</a>`;
  } else if (targetPostId) {
    return `<a href="${config.host}/post/${targetPostId}">post</a>`;
  }

  return 'deleted entry';
}

import moment from 'moment';
import Mailer from '../../lib/mailer';
import { load as configLoader } from '../../config/config';

const config = configLoader();

export function sendEventsDigestEmail(user, events, users, groups, digestInterval) {
  // TODO: const subject = config.mailer.notificationDigestEmailSubject
  let emailBody = '';
  for (const event of events) {
    const eventData = getEventPayload(event, users, groups);
    const eventText = notificationTemplates[event.event_type](eventData);
    const eventMarkup = getEventMarkup(eventText);
    emailBody += `${eventMarkup}\n`;
  }

  return Mailer.sendMail(user, 'Notifications digest', {
    digest: {
      body:     emailBody,
      interval: digestInterval,
    },
    recipient: user,
    baseUrl:   config.host,
  }, `${config.appRoot}/app/scripts/views/mailer/notificationsDigest.ejs`, true);
}

function getEventPayload(event, users, groups) {
  const creator = users.find((u) => {
    return u.id === event.created_user_id;
  });
  const affectedUser = users.find((u) => {
    return u.id === event.affected_user_id;
  });
  const postAuthor = users.find((u) => {
    return u.id === event.post_author_id;
  });
  const group = groups.find((g) => {
    return g.id === event.group_id;
  });
  return {
    creator,
    affectedUser,
    postAuthor,
    commentId: event.comment_id,
    postId:    event.post_id,
    group,
    createdAt: moment(event.date)
  };
}

const notificationTemplates = {
  mention_in_post: (eventData) => {
    const postAuthorLink = makeUserLink(eventData.postAuthor);
    const postLink = makePostLink(eventData.postId, eventData.postAuthor);
    const groupLink = eventData.group ?  makeUserLink(eventData.group) : null;
    const eventTime = eventData.createdAt.format('HH:MM');
    return `
      ${postAuthorLink} mentioned you in the ${postLink}${groupLink ? ` [in ${groupLink}]` : ''}<br />
      ${eventTime}
    `;
  },
  mention_in_comment: (eventData) => {
    const commentAuthorLink = makeUserLink(eventData.creator);
    const postLink = makePostLink(eventData.postId, eventData.postAuthor);
    const commentLink = makeCommentLink(eventData.postId, eventData.commentId, eventData.postAuthor, 'comment');
    const groupLink = eventData.group ?  makeUserLink(eventData.group) : null;
    const eventTime = eventData.createdAt.format('HH:MM');
    return `
      ${commentAuthorLink} mentioned you in a ${commentLink} to the ${postLink}${groupLink ? ` [in ${groupLink}]` : ''}<br />
      ${eventTime}
    `;
  },
  mention_comment_to: (eventData) => {
    const commentAuthorLink = makeUserLink(eventData.creator);
    const postLink = makePostLink(eventData.postId, eventData.postAuthor);
    const commentLink = makeCommentLink(eventData.postId, eventData.commentId, eventData.postAuthor, 'replied');
    const groupLink = eventData.group ?  makeUserLink(eventData.group) : null;
    const eventTime = eventData.createdAt.format('HH:MM');
    return `
      ${commentAuthorLink} ${commentLink} to you in the  ${postLink}${groupLink ? ` [in ${groupLink}]` : ''}<br />
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
    const commentLink = makeCommentLink(eventData.postId, eventData.commentId, eventData.postAuthor, 'comment');
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
  user_unsubscribed: (eventData) => {
    const unsubscriberLink = makeUserLink(eventData.creator);
    const eventTime = eventData.createdAt.format('HH:MM');
    return `
      ${unsubscriberLink} unsubscribed from your feed<br />
      ${eventTime}
    `;
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
  }
};

function makeUserLink(user) {
  return `<a href="${config.host}/${user.username}" style="color:#555599;">@${user.username}</a>`;
}

function makePostLink(postId, postAuthor, isDirect = false) {
  const postLink = `${config.host}/${postAuthor.username}/${postId}`;
  return `<a href="${postLink}" style="color:#555599;">${isDirect ? 'direct message' : 'post'}</a>`;
}

function makeCommentLink(postId, commentId, postAuthor, linkText) {
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

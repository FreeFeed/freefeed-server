import _ from 'lodash';

export const EVENT_TYPES = {
  MENTION_IN_POST:               'mention_in_post',
  MENTION_IN_COMMENT:            'mention_in_comment',
  MENTION_COMMENT_TO:            'mention_comment_to',
  USER_BANNED:                   'banned_user',
  USER_UNBANNED:                 'unbanned_user',
  BANNED_BY:                     'banned_by_user',
  UNBANNED_BY:                   'unbanned_by_user',
  USER_SUBSCRIBED:               'user_subscribed',
  USER_UNSUBSCRIBED:             'user_unsubscribed',
  SUBSCRIPTION_REQUESTED:        'subscription_requested',
  SUBSCRIPTION_REQUEST_REVOKED:  'subscription_request_revoked',
  SUBSCRIPTION_REQUEST_APPROVED: 'subscription_request_approved',
  SUBSCRIPTION_REQUEST_REJECTED: 'subscription_request_rejected',
  GROUP_CREATED:                 'group_created',
  GROUP_SUBSCRIBED:              'group_subscribed',
  GROUP_UNSUBSCRIBED:            'group_unsubscribed',
  GROUP_SUBSCRIPTION_REQUEST:    'group_subscription_requested',
  GROUP_REQUEST_REVOKED:         'group_subscription_request_revoked',
  GROUP_SUBSCRIPTION_APPROVED:   'group_subscription_approved',
  GROUP_SUBSCRIPTION_REJECTED:   'group_subscription_rejected',
  GROUP_ADMIN_PROMOTED:          'group_admin_promoted',
  GROUP_ADMIN_DEMOTED:           'group_admin_demoted',
  DIRECT_CREATED:                'direct',
  DIRECT_COMMENT_CREATED:        'direct_comment',

  MANAGED_GROUP_SUBSCRIPTION_APPROVED: 'managed_group_subscription_approved',
  MANAGED_GROUP_SUBSCRIPTION_REJECTED: 'managed_group_subscription_rejected',
};

export const INVISIBLE_EVENT_TYPES = ['banned_by_user', 'unbanned_by_user', 'user_unsubscribed'];
export const ALLOWED_EVENT_TYPES = _.difference(_.values(EVENT_TYPES), INVISIBLE_EVENT_TYPES);
export const NOT_COUNTABLE_EVENT_TYPES = [...INVISIBLE_EVENT_TYPES, 'banned_user', 'unbanned_user', 'group_created', 'direct', 'direct_comment'];
export const COUNTABLE_EVENT_TYPES = _.difference(_.values(EVENT_TYPES), NOT_COUNTABLE_EVENT_TYPES);
export const DIGEST_EVENT_TYPES = _.difference(_.values(EVENT_TYPES), [...INVISIBLE_EVENT_TYPES, 'banned_user', 'unbanned_user', 'group_created']);

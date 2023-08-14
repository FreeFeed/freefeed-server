import _unexpected from 'unexpected';
import validator from 'validator';

import { Comment } from '../../app/models';
import { validate as validateUserPrefs } from '../../app/models/user-prefs';

export const freefeedAssertions = {
  name: 'unexpected-freefeed',
  installInto: (unexpected) => {
    unexpected.addAssertion('<string> to be UUID', (xpct, subject) => {
      const uuidRegExp = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-(8|9|a|b)[a-f0-9]{3}-[a-f0-9]{12}$/;
      xpct(subject, 'to match', uuidRegExp);
    });

    unexpected.addAssertion('<string> to be a hexadecimal string', (xpct, subject) => {
      xpct(subject, 'to match', /^[a-f0-9]{3,10}$/);
    });

    unexpected.addAssertion('<string> to be boolString', (xpct, subject) => {
      xpct(subject, 'to be one of', ['0', '1']);
    });

    unexpected.addAssertion('<string> to be timeStampString', (xpct, subject) => {
      xpct(subject, 'to match', /^\d+$/);
    });

    unexpected.addAssertion('<string> to be iso8601TimeString', (xpct, subject) => {
      const d = new Date(subject);
      xpct(d instanceof Date && !isNaN(d), 'to be true');
    });

    unexpected.addAssertion('<object> to be a serialized user or group', (xpct, subject) => {
      const isGroup = subject && typeof subject === 'object' && subject.type === 'group';
      return xpct(subject, 'to exhaustively satisfy', isGroup ? group : user);
    });

    unexpected.addAssertion('<object> to be a serialized post', (xpct, subject) => {
      const tpl = { ...postBasic };

      if (subject && typeof subject === 'object' && 'isHidden' in subject) {
        tpl.isHidden = xpct.it('to be', true);
      }

      if (subject && typeof subject === 'object' && 'isSaved' in subject) {
        tpl.isSaved = xpct.it('to be', true);
      }

      if (subject && typeof subject === 'object' && subject.friendfeedUrl) {
        tpl.friendfeedUrl = xpct.it('to be a string');
      }

      return xpct(subject, 'to exhaustively satisfy', tpl);
    });

    unexpected.addAssertion('<object> to be a serialized attachment', (xpct, subject) => {
      switch (subject.mediaType) {
        case 'image':
          return xpct(subject, 'to exhaustively satisfy', attachmentImage);
        case 'audio':
          return xpct(subject, 'to exhaustively satisfy', attachmentAudio);
        case 'general':
          return xpct(subject, 'to exhaustively satisfy', attachmentGeneral);
      }

      return null;
    });

    unexpected.addAssertion('<object> to be a serialized comment', (xpct, subject) => {
      const isHidden =
        subject && typeof subject === 'object' && subject.hideType !== Comment.VISIBLE;
      const createdByExpectation = isHidden ? xpct.it('to be null') : xpct.it('to be UUID');

      xpct(subject, 'to exhaustively satisfy', {
        ...commentBasic,
        createdBy: createdByExpectation,
      });
    });

    unexpected.addAssertion(
      '<object> to be [an] API error <number> <string>',
      (xpct, subject, code, message) => {
        xpct(subject, 'to satisfy', { status: code });

        xpct(subject.json(), 'when fulfilled', 'to satisfy', { err: message });
      },
    );

    unexpected.addAssertion('<object> to have 1 like by <object>', async (xpct, subject, liker) => {
      xpct(subject, 'to satisfy', { status: 200 });
      await xpct(subject.json(), 'when fulfilled', 'to satisfy', {
        likes: xpct
          .it('to be an array')
          .and('to be non-empty')
          .and('to have length', 1)
          .and('to have items satisfying', {
            userId: xpct.it('to be UUID').and('to be', liker.user.id),
            createdAt: xpct.it('when passed as parameter to', validator.isISO8601, 'to be', true),
          }),
        users: xpct.it('to be an array').and('to have items satisfying', user),
      });
    });

    unexpected.addAssertion('<object> to have no likes', async (xpct, subject) => {
      xpct(subject, 'to satisfy', { status: 200 });
      await xpct(subject.json(), 'when fulfilled', 'to satisfy', {
        likes: xpct.it('to be an array').and('to be empty'),
        users: xpct.it('to be an array').and('to be empty'),
      });
    });

    unexpected.addAssertion('<object> to be [an] invitation response', async (xpct, subject) => {
      xpct(subject, 'to satisfy', { status: 200 });

      await xpct(subject.json(), 'when fulfilled', 'to satisfy', {
        invitation: xpct.it('to satisfy', {
          id: xpct.it('to be a number'),
          secure_id: xpct.it('to be UUID'),
          author: xpct.it('to be UUID'),
          message: xpct.it('to be a string'),
          lang: xpct.it('to be a string'),
          single_use: xpct.it('to be a boolean'),
          recommendations: xpct.it('to satisfy', {
            users: xpct
              .it('to be an array')
              .and('to be empty')
              .or('to have items satisfying', xpct.it('to be a string')),
            groups: xpct
              .it('to be an array')
              .and('to be empty')
              .or('to have items satisfying', xpct.it('to be a string')),
          }),
          registrations_count: xpct.it('to be a number'),
          created_at: xpct.it('when passed as parameter to', validator.isISO8601, 'to be', true),
        }),
        users: xpct.it('to be an array').and('to be empty').or('to have items satisfying', user),
        groups: xpct.it('to be an array').and('to be empty').or('to have items satisfying', group),
      });
    });

    unexpected.addAssertion('<object> to be valid preferences', (xpct, subject) => {
      xpct(() => validateUserPrefs(subject), 'to be an object');
    });
  },
};

const expect = _unexpected.clone().use(freefeedAssertions);

export const userBasic = {
  id: expect.it('to be UUID'),
  username: expect.it('to be a string'),
  screenName: expect.it('to be a string'),
  isPrivate: expect.it('to be boolString'),
  isProtected: expect.it('to be boolString'),
  createdAt: expect.it('to be timeStampString'),
  updatedAt: expect.it('to be timeStampString'),
  type: expect.it('to equal', 'user'),
  description: expect.it('to be a string'),
  profilePictureLargeUrl: expect.it('to be a string'),
  profilePictureMediumUrl: expect.it('to be a string'),
  youCan: expect
    .it('to be an array')
    .and('to be empty')
    .or('to have items satisfying', 'to be a string'),
  theyDid: expect
    .it('to be an array')
    .and('to be empty')
    .or('to have items satisfying', 'to be a string'),
};

export const groupBasic = {
  ...userBasic,
  isRestricted: expect.it('to be boolString'),
  type: expect.it('to equal', 'group'),
  youCan: expect
    .it('to be an array')
    .and('to be empty')
    .or('to have items satisfying', 'to be a string'),
  theyDid: expect
    .it('to be an array')
    .and('to be empty')
    .or('to have items satisfying', 'to be a string'),
};

export const user = {
  ...userBasic,
  statistics: expect.it('to be an object'),
};

export const group = {
  ...groupBasic,
  statistics: expect.it('to be an object'),
  administrators: expect.it('to be an array').and('to have items satisfying', 'to be UUID'),
};

export const userOrGroup = (obj) => {
  const isGroup = obj && typeof obj === 'object' && obj.type === 'group';
  return expect(obj, 'to exhaustively satisfy', isGroup ? group : user);
};

const postBasic = {
  id: expect.it('to be UUID'),
  shortId: expect.it('to be a hexadecimal string'),
  body: expect.it('to be a string'),
  commentsDisabled: expect.it('to be boolString'),
  createdAt: expect.it('to be timeStampString'),
  updatedAt: expect.it('to be timeStampString'),
  createdBy: expect.it('to be UUID'),
  postedTo: expect
    .it('to be an array')
    .and('to be empty')
    .or('to have items satisfying', 'to be UUID'),
  attachments: expect
    .it('to be an array')
    .and('to be empty')
    .or('to have items satisfying', 'to be UUID'),
  comments: expect
    .it('to be an array')
    .and('to be empty')
    .or('to have items satisfying', 'to be UUID'),
  likes: expect
    .it('to be an array')
    .and('to be empty')
    .or('to have items satisfying', 'to be UUID'),
  omittedComments: expect.it('to be a number'),
  omittedLikes: expect.it('to be a number'),
  commentLikes: expect.it('to be a number'),
  ownCommentLikes: expect.it('to be a number'),
  omittedCommentLikes: expect.it('to be a number'),
  omittedOwnCommentLikes: expect.it('to be a number'),
  backlinksCount: expect.it('to be a number'),
};

const commentBasic = {
  id: expect.it('to be UUID'),
  shortId: expect.it('to be a hexadecimal string'),
  postId: expect.it('to be UUID'),
  body: expect.it('to be a string'),
  createdAt: expect.it('to be timeStampString'),
  updatedAt: expect.it('to be timeStampString'),
  hideType: expect.it('to be greater than or equal to', Comment.VISIBLE),
  likes: expect.it('to be a number'),
  hasOwnLike: expect.it('to be a boolean'),
  seqNumber: expect.it('to be a number'),
};

const attachmentCommons = {
  id: expect.it('to be UUID'),
  createdAt: expect.it('to be timeStampString'),
  updatedAt: expect.it('to be timeStampString'),
  createdBy: expect.it('to be UUID'),
  postId: expect.it('to be null').or('to be UUID'),
  mediaType: expect.it('to be one of', ['image', 'audio', 'general']),
  fileName: expect.it('to be a string'),
  fileSize: expect.it('to be a string').and('to match', /^\d+$/),
  imageSizes: expect.it('to be an object'),
  thumbnailUrl: expect.it('to be a string'),
  url: expect.it('to be a string'),
};

export const attachmentImage = {
  ...attachmentCommons,
  mediaType: expect.it('to equal', 'image'),
  imageSizes: expect
    .it('to have keys satisfying', 'to be one of', ['o', 't', 't2'])
    .and('to have values exhaustively satisfying', {
      w: expect.it('to be a number'),
      h: expect.it('to be a number'),
      url: expect.it('to be a string'),
    }),
};

export const attachmentAudio = {
  ...attachmentCommons,
  mediaType: expect.it('to equal', 'audio'),
  artist: expect.it('to be a string'),
  title: expect.it('to be a string'),
  imageSizes: expect.it('to be empty'),
};

export const attachmentGeneral = {
  ...attachmentCommons,
  mediaType: expect.it('to equal', 'general'),
  imageSizes: expect.it('to be empty'),
};

export const postResponse = {
  posts: expect.it('to be a serialized post'),
  users: expect.it('to be an array').and('to be empty').or('to have items satisfying', user),
  comments: expect
    .it('to be an array')
    .and('to be empty')
    .or('to have items satisfying', 'to be a serialized comment'),
  attachments: expect
    .it('to be an array')
    .and('to be empty')
    .or('to have items satisfying', 'to be a serialized attachment'),
  subscribers: expect
    .it('to be an array')
    .and('to be empty')
    .or('to have items satisfying', 'to be a serialized user or group'),
  subscriptions: expect
    .it('to be an array')
    .and('to be empty')
    .or('to have items satisfying', {
      id: expect.it('to be UUID'),
      name: expect.it('to be one of', ['Posts', 'Directs']),
      user: expect.it('to be UUID'),
    }),
};

export const timelineResponse = {
  timelines: expect.it('to exhaustively satisfy', {
    id: expect.it('to be UUID'),
    name: expect.it('to be one of', [
      'RiverOfNews',
      'Hides',
      'Comments',
      'Likes',
      'Posts',
      'Directs',
      'MyDiscussions',
      'Saves',
    ]),
    user: expect.it('to be UUID'),
    posts: expect
      .it('to be an array')
      .and('to be empty')
      .or('to have items satisfying', 'to be UUID'),
    subscribers: expect
      .it('to be an array')
      .and('to be empty')
      .or('to have items satisfying', 'to be UUID'),
  }),
  users: expect
    .it('to be an array')
    .and('to be empty')
    .or('to have items satisfying', 'to be a serialized user or group'),
  admins: expect.it('to be an array').and('to be empty').or('to have items satisfying', user),
  posts: expect
    .it('to be an array')
    .and('to be empty')
    .or('to have items satisfying', 'to be a serialized post'),
  comments: expect
    .it('to be an array')
    .and('to be empty')
    .or('to have items satisfying', 'to be a serialized comment'),
  attachments: expect
    .it('to be an array')
    .and('to be empty')
    .or('to have items satisfying', 'to be a serialized attachment'),
  subscribers: expect
    .it('to be an array')
    .and('to be empty')
    .or('to have items satisfying', 'to be a serialized user or group'),
  subscriptions: expect
    .it('to be an array')
    .and('to be empty')
    .or('to have items satisfying', {
      id: expect.it('to be UUID'),
      name: expect.it('to be one of', ['Posts', 'Directs']),
      user: expect.it('to be UUID'),
    }),
  isLastPage: expect.it('to be a boolean'),
};

export const everythingResponse = {
  ...timelineResponse,
  timelines: expect.it('to be null'),
  admins: expect.it('to be an array').and('to be empty'),
};

export const postsByIdsResponse = {
  ...timelineResponse,
  admins: expect.it('to be an array').and('to be empty'),
  postsNotFound: expect
    .it('to be an array')
    .and('to be empty')
    .or('to have items satisfying', 'to be UUID'),
  timelines: undefined,
  isLastPage: undefined,
};

export const allGroupsResponse = {
  withProtected: expect.it('to be a boolean'),
  groups: expect
    .it('to be an array')
    .and('to be empty')
    .or('to have items satisfying', {
      id: expect.it('to be UUID'),
      subscribers: expect.it('not to be negative'),
      postsByMonth: expect.it('not to be negative'),
      authorsVariety: expect.it('to be within', 0, 1),
    }),
  users: expect
    .it('to be an array')
    .and('to be empty')
    .or('to have items satisfying', 'to be a serialized user or group'),
};

export const userSubscriptionsResponse = {
  subscribers: expect
    .it('to be an array')
    .and('to be empty')
    .or('to have items satisfying', 'to be a serialized user or group'),
  subscriptions: expect
    .it('to be an array')
    .and('to be empty')
    .or('to have items satisfying', {
      id: expect.it('to be UUID'),
      name: expect.it('to be one of', ['Posts', 'Comments', 'Likes']),
      user: expect.it('to be UUID'),
    }),
};

export const userSubscribersResponse = {
  subscribers: expect.it('to be an array').and('to be empty').or('to have items satisfying', user),
};

export const appTokenInfoRestricted = {
  id: expect.it('to be UUID'),
  issue: expect.it('to be a number'),
  createdAt: expect.it('to be iso8601TimeString'),
  updatedAt: expect.it('to be iso8601TimeString'),
  expiresAt: expect.it('to be null').or('to be iso8601TimeString'),
  scopes: expect
    .it('to be an array')
    .and('to be empty')
    .or('to have items satisfying', 'to be a string'),
  restrictions: expect.it('to exhaustively satisfy', {
    netmasks: expect
      .it('to be an array')
      .and('to be empty')
      .or('to have items satisfying', 'to be a string'),
    origins: expect
      .it('to be an array')
      .and('to be empty')
      .or('to have items satisfying', 'to be a string'),
  }),
  // Restricted fields
  title: expect.it('to be undefined'),
  lastUsedAt: expect.it('to be undefined'),
  lastIP: expect.it('to be undefined'),
  lastUserAgent: expect.it('to be undefined'),
};

export const appTokenInfo = {
  ...appTokenInfoRestricted,
  title: expect.it('to be a string'),
  lastUsedAt: expect.it('to be null').or('to be iso8601TimeString'),
  lastIP: expect.it('to be null').or('to be a string'),
  lastUserAgent: expect.it('to be null').or('to be a string'),
};

export const serverInfoResponse = {
  version: expect.it('to be a string'),
  externalAuthProviders: expect
    .it('to be an array')
    .and('to be empty')
    .or('to have items satisfying', 'to be a string'),
  externalAuthProvidersInfo: expect
    .it('to be an array')
    .and('to be empty')
    .or('to have items satisfying', {
      id: expect.it('to be a string'),
      brand: expect.it('to be a string'),
      title: expect.it('to be a string'),
    }),
  registrationOpen: expect.it('to be a boolean'),
  attachments: {
    fileSizeLimit: expect.it('to be a number'),
    maxCountPerPost: expect.it('to be a number'),
  },
  maxTextLength: {
    post: expect.it('to be a number'),
    comment: expect.it('to be a number'),
    description: expect.it('to be a number'),
  },
  registrationRequiresInvite: expect.it('to be a boolean'),
  multiUseInvitesEnabled: expect.it('to be a boolean'),
  textTranslation: expect.it('to satisfy', {
    enabled: expect.it('to be a boolean'),
    serviceTitle: expect.it('to be a string'),
  }),
};

export const externalProfile = {
  id: expect.it('to be UUID'),
  provider: expect.it('to be a string'),
  title: expect.it('to be a string'),
  createdAt: expect.it('to be iso8601TimeString'),
};

export const extAuthProfilesResponse = {
  //
  profiles: expect
    .it('to be an array')
    .and('to be empty')
    .or('to have items satisfying', externalProfile),
};

export const homeFeed = {
  id: expect.it('to be UUID'),
  user: expect.it('to be UUID'),
  name: expect.it('to be', 'RiverOfNews'),
  title: expect.it('to be a string'),
  isInherent: expect.it('to be a boolean'),
  createdAt: expect.it('to be iso8601TimeString'),
};

export const homeFeedsListResponse = {
  timelines: expect.it('to be an array').and('to have items satisfying', homeFeed),
  users: [expect.it('to satisfy', user)], // just one user (owner of home feeds)
};

export const homeFeedsOneResponse = {
  timeline: expect.it('to satisfy', homeFeed),
  subscribedTo: expect
    .it('to be an array')
    .and('to be empty')
    .or('to have items satisfying', 'to be UUID'),
  users: expect.it('to be an array').and('to have items satisfying', user),
};

export const homeFeedsSubscriptionsResponse = {
  usersInHomeFeeds: expect
    .it('to be an array')
    .and('to be empty')
    .or('to have items satisfying', {
      id: expect.it('to be UUID'),
      homeFeeds: expect
        .it('to be an array')
        .and('to be empty')
        .or('to have items satisfying', 'to be UUID'),
    }),
  timelines: expect.it('to be an array').and('to have items satisfying', homeFeed),
  users: expect.it('to be an array').and('to have items satisfying', user),
};

export const getCommentResponse = {
  comments: expect.it('to be a serialized comment'),
  users: expect.it('to be an array').and('to have items satisfying', user),
  admins: expect.it('to be an array').and('to have items satisfying', user),
};

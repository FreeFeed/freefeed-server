import expect from 'unexpected'

import { Comment } from '../../app/models'


export const boolString = (v) => expect(v, 'to be a string').and('to be one of', ['0', '1']);

export const timeStampString = (v) => expect(v, 'to be a string').and('to match', /^\d+$/);

export const iso8601TimeString = (v) => {
  const d = new Date(v);
  return expect(d instanceof Date && !isNaN(d), 'to be true');
};

export const UUID = (v) => expect(v, 'to match', /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-(8|9|a|b)[a-f0-9]{3}-[a-f0-9]{12}$/);

export const userBasic = {
  id:                      expect.it('to satisfy', UUID),
  username:                expect.it('to be a string'),
  screenName:              expect.it('to be a string'),
  isPrivate:               expect.it('to satisfy', boolString),
  isProtected:             expect.it('to satisfy', boolString),
  createdAt:               expect.it('to satisfy', timeStampString),
  updatedAt:               expect.it('to satisfy', timeStampString),
  type:                    expect.it('to equal', 'user'),
  description:             expect.it('to be a string'),
  profilePictureLargeUrl:  expect.it('to be a string'),
  profilePictureMediumUrl: expect.it('to be a string'),
};

export const groupBasic = {
  ...userBasic,
  isRestricted: expect.it('to satisfy', boolString),
  type:         expect.it('to equal', 'group'),
};

export const user = {
  ...userBasic,
  statistics: expect.it('to be an object'),
};

export const group = {
  ...groupBasic,
  statistics:     expect.it('to be an object'),
  administrators: expect.it('to be an array').and('to have items satisfying', UUID),
};

export const userOrGroupBasic = (obj) => {
  const isGroup = obj && typeof obj === 'object' && obj.type === 'group';
  return expect(obj, 'to exhaustively satisfy', isGroup ? groupBasic : userBasic);
};

export const userOrGroup = (obj) => {
  const isGroup = obj && typeof obj === 'object' && obj.type === 'group';
  return expect(obj, 'to exhaustively satisfy', isGroup ? group : user);
};

const postBasic = {
  id:                     expect.it('to satisfy', UUID),
  body:                   expect.it('to be a string'),
  commentsDisabled:       expect.it('to satisfy', boolString),
  createdAt:              expect.it('to satisfy', timeStampString),
  updatedAt:              expect.it('to satisfy', timeStampString),
  createdBy:              expect.it('to satisfy', UUID),
  postedTo:               expect.it('to be an array').and('to be empty').or('to have items satisfying', UUID),
  attachments:            expect.it('to be an array').and('to be empty').or('to have items satisfying', UUID),
  comments:               expect.it('to be an array').and('to be empty').or('to have items satisfying', UUID),
  likes:                  expect.it('to be an array').and('to be empty').or('to have items satisfying', UUID),
  omittedComments:        expect.it('to be a number'),
  omittedLikes:           expect.it('to be a number'),
  commentLikes:           expect.it('to be a number'),
  ownCommentLikes:        expect.it('to be a number'),
  omittedCommentLikes:    expect.it('to be a number'),
  omittedOwnCommentLikes: expect.it('to be a number'),
};

export const post = (obj) => {
  const tpl = { ...postBasic };

  if (obj && typeof obj === 'object' && ('isHidden' in obj)) {
    tpl.isHidden = expect.it('to be', true);
  }

  if (obj && typeof obj === 'object' && ('isSaved' in obj)) {
    tpl.isSaved = expect.it('to be', true);
  }

  if (obj && typeof obj === 'object' && obj.friendfeedUrl) {
    tpl.friendfeedUrl = expect.it('to be a string');
  }

  return expect(obj, 'to exhaustively satisfy', tpl);
};

const commentBasic = {
  id:         expect.it('to satisfy', UUID),
  body:       expect.it('to be a string'),
  createdAt:  expect.it('to satisfy', timeStampString),
  updatedAt:  expect.it('to satisfy', timeStampString),
  hideType:   expect.it('to be greater than or equal to', Comment.VISIBLE),
  likes:      expect.it('to be a number'),
  hasOwnLike: expect.it('to be a boolean'),
};

export const comment = (obj) => {
  const isHidden = obj && typeof obj === 'object' && obj.hideType !== Comment.VISIBLE;
  const createdByExpectation = isHidden ? expect.it('to be null') : expect.it('to satisfy', UUID);
  return expect(obj, 'to exhaustively satisfy', {
    ...commentBasic,
    createdBy: createdByExpectation,
  });
};

const attachmentCommons = {
  id:           expect.it('to satisfy', UUID),
  createdAt:    expect.it('to satisfy', timeStampString),
  updatedAt:    expect.it('to satisfy', timeStampString),
  createdBy:    expect.it('to satisfy', UUID),
  mediaType:    expect.it('to be one of', ['image', 'audio', 'general']),
  fileName:     expect.it('to be a string'),
  fileSize:     expect.it('to be a string').and('to match', /^\d+$/),
  imageSizes:   expect.it('to be an object'),
  thumbnailUrl: expect.it('to be a string'),
  url:          expect.it('to be a string'),
};

export const attachmentImage = {
  ...attachmentCommons,
  mediaType:  expect.it('to equal', 'image'),
  imageSizes: expect.it('to have keys satisfying', 'to be one of', ['o', 't', 't2'])
    .and('to have values exhaustively satisfying', {
      w:   expect.it('to be a number'),
      h:   expect.it('to be a number'),
      url: expect.it('to be a string'),
    }),
};

export const attachmentAudio = {
  ...attachmentCommons,
  mediaType:  expect.it('to equal', 'audio'),
  artist:     expect.it('to be a string'),
  title:      expect.it('to be a string'),
  imageSizes: expect.it('to be empty'),
};

export const attachmentGeneral = {
  ...attachmentCommons,
  mediaType:  expect.it('to equal', 'general'),
  imageSizes: expect.it('to be empty'),
};

const properAttachmentType = (obj) => {
  switch (obj.mediaType) {
    case 'image':   return expect(obj, 'to exhaustively satisfy', attachmentImage);
    case 'audio':   return expect(obj, 'to exhaustively satisfy', attachmentAudio);
    case 'general': return expect(obj, 'to exhaustively satisfy', attachmentGeneral);
  }

  return null;
};

export const attachment = (obj) => {
  return expect(obj, 'to be an object')
    .and('to satisfy', properAttachmentType);
};

export const postResponse = {
  posts:         expect.it('to satisfy', post),
  users:         expect.it('to be an array').and('to be empty').or('to have items satisfying', user),
  comments:      expect.it('to be an array').and('to be empty').or('to have items satisfying', comment),
  attachments:   expect.it('to be an array').and('to be empty').or('to have items satisfying', attachment),
  subscribers:   expect.it('to be an array').and('to be empty').or('to have items satisfying', userOrGroup),
  subscriptions: expect.it('to be an array').and('to be empty').or('to have items satisfying', {
    id:   expect.it('to satisfy', UUID),
    name: expect.it('to be one of', ['Posts', 'Directs']),
    user: expect.it('to satisfy', UUID),
  }),
};

export const timelineResponse = {
  timelines: expect.it('to exhaustively satisfy', {
    id:          expect.it('to satisfy', UUID),
    name:        expect.it('to be one of', ['RiverOfNews', 'Hides', 'Comments', 'Likes', 'Posts', 'Directs', 'MyDiscussions', 'Saves']),
    user:        expect.it('to satisfy', UUID),
    posts:       expect.it('to be an array').and('to be empty').or('to have items satisfying', UUID),
    subscribers: expect.it('to be an array').and('to be empty').or('to have items satisfying', UUID),
  }),
  users:         expect.it('to be an array').and('to be empty').or('to have items satisfying', userOrGroup),
  admins:        expect.it('to be an array').and('to be empty').or('to have items satisfying', user),
  posts:         expect.it('to be an array').and('to be empty').or('to have items satisfying', post),
  comments:      expect.it('to be an array').and('to be empty').or('to have items satisfying', comment),
  attachments:   expect.it('to be an array').and('to be empty').or('to have items satisfying', attachment),
  subscribers:   expect.it('to be an array').and('to be empty').or('to have items satisfying', userOrGroup),
  subscriptions: expect.it('to be an array').and('to be empty').or('to have items satisfying', {
    id:   expect.it('to satisfy', UUID),
    name: expect.it('to be one of', ['Posts', 'Directs']),
    user: expect.it('to satisfy', UUID),
  }),
  isLastPage: expect.it('to be a boolean'),
};

export const everythingResponse = {
  ...timelineResponse,
  timelines: expect.it('to be null'),
  admins:    expect.it('to be an array').and('to be empty'),
};

export const allGroupsResponse = {
  withProtected: expect.it('to be a boolean'),
  groups:        expect.it('to be an array').and('to be empty').or('to have items satisfying', {
    id:             expect.it('to satisfy', UUID),
    subscribers:    expect.it('not to be negative'),
    postsByMonth:   expect.it('not to be negative'),
    authorsVariety: expect.it('to be within', 0, 1),
  }),
  users: expect.it('to be an array').and('to be empty').or('to have items satisfying', userOrGroup),
};

export const userSubscriptionsResponse = {
  subscribers:   expect.it('to be an array').and('to be empty').or('to have items satisfying', userOrGroup),
  subscriptions: expect.it('to be an array').and('to be empty').or('to have items satisfying', {
    id:   expect.it('to satisfy', UUID),
    name: expect.it('to be one of', ['Posts', 'Comments', 'Likes']),
    user: expect.it('to satisfy', UUID),
  }),
};

export const userSubscribersResponse = { subscribers: expect.it('to be an array').and('to be empty').or('to have items satisfying', user) };

export const appTokenInfoRestricted = {
  id:           expect.it('to satisfy', UUID),
  issue:        expect.it('to be a number'),
  createdAt:    expect.it('to satisfy', iso8601TimeString),
  updatedAt:    expect.it('to satisfy', iso8601TimeString),
  scopes:       expect.it('to be an array').and('to be empty').or('to have items satisfying', 'to be a string'),
  restrictions: expect.it('to exhaustively satisfy', {
    netmasks: expect.it('to be an array').and('to be empty').or('to have items satisfying', 'to be a string'),
    origins:  expect.it('to be an array').and('to be empty').or('to have items satisfying', 'to be a string'),
  }),
  // Restricted fields
  title:         expect.it('to be undefined'),
  lastUsedAt:    expect.it('to be undefined'),
  lastIP:        expect.it('to be undefined'),
  lastUserAgent: expect.it('to be undefined'),
};

export const appTokenInfo = {
  ...appTokenInfoRestricted,
  title:         expect.it('to be a string'),
  lastUsedAt:    expect.it('to be null').or('to satisfy', iso8601TimeString),
  lastIP:        expect.it('to be null').or('to be a string'),
  lastUserAgent: expect.it('to be null').or('to be a string'),
};

export const serverInfoResponse = {
  version:               expect.it('to be a string'),
  externalAuthProviders: expect.it('to be an array').and('to be empty').or('to have items satisfying', 'to be a string'),
  registrationOpen:      expect.it('to be a boolean'),
};

export const externalProfile = {
  'id':        expect.it('to satisfy', UUID),
  'provider':  expect.it('to be a string'),
  'title':     expect.it('to be a string'),
  'createdAt': expect.it('to satisfy', iso8601TimeString),
};

export const extAuthProfilesResponse = {
  //
  profiles: expect.it('to be an array').and('to be empty').or('to have items satisfying', externalProfile),
};

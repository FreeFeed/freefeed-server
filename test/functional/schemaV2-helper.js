import expect from 'unexpected'

export const boolString = (v) => expect(v, 'to be a string').and('to be one of', ['0', '1']);

export const timeStampString = (v) => expect(v, 'to be a string').and('to match', /^\d+$/);

export const UUID = (v) => expect(v, 'to match', /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-(8|9|a|b)[a-f0-9]{3}-[a-f0-9]{12}$/);

export const user = {
  id:                      expect.it('to satisfy', UUID),
  username:                expect.it('to be a string'),
  screenName:              expect.it('to be a string'),
  isPrivate:               expect.it('to satisfy', boolString),
  isProtected:             expect.it('to satisfy', boolString),
  isVisibleToAnonymous:    expect.it('to satisfy', boolString),
  createdAt:               expect.it('to satisfy', timeStampString),
  updatedAt:               expect.it('to satisfy', timeStampString),
  type:                    expect.it('to equal', 'user'),
  description:             expect.it('to be a string'),
  profilePictureLargeUrl:  expect.it('to be a string'),
  profilePictureMediumUrl: expect.it('to be a string'),
  statistics:              expect.it('to be an object'),
};

export const group = {
  ...user,
  isRestricted:   expect.it('to satisfy', boolString),
  type:           expect.it('to equal', 'group'),
  administrators: expect.it('to be an array').and('to have items satisfying', UUID),
};

export const userOrGroup = (obj) => {
  const isGroup = obj && typeof obj === 'object' && obj.type === 'group';
  return expect(obj, 'to exhaustively satisfy', isGroup ? group : user);
};

const postBasic = {
  id:               expect.it('to satisfy', UUID),
  body:             expect.it('to be a string'),
  commentsDisabled: expect.it('to satisfy', boolString),
  createdAt:        expect.it('to satisfy', timeStampString),
  updatedAt:        expect.it('to satisfy', timeStampString),
  createdBy:        expect.it('to satisfy', UUID),
  postedTo:         expect.it('to be an array').and('to be empty').or('to have items satisfying', UUID),
  attachments:      expect.it('to be an array').and('to be empty').or('to have items satisfying', UUID),
  comments:         expect.it('to be an array').and('to be empty').or('to have items satisfying', UUID),
  likes:            expect.it('to be an array').and('to be empty').or('to have items satisfying', UUID),
  omittedComments:  expect.it('to be a number'),
  omittedLikes:     expect.it('to be a number'),
};

export const post = (obj) => {
  const isHidden = obj && typeof obj === 'object' && obj.isHidden;
  if (!isHidden) {
    return expect(obj, 'to exhaustively satisfy', postBasic);
  }
  return expect(obj, 'to exhaustively satisfy', {
    ...postBasic,
    isHidden: expect.it('to be', true),
  });
};

export const comment = {
  id:        expect.it('to satisfy', UUID),
  body:      expect.it('to be a string'),
  createdAt: expect.it('to satisfy', timeStampString),
  updatedAt: expect.it('to satisfy', timeStampString),
  createdBy: expect.it('to satisfy', UUID),
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

export const attachment = (obj) =>
  expect(obj, 'to be an object')
  .and('to satisfy', attachmentCommons)
  .and('to satisfy', (obj) => {
    switch (obj.mediaType) {
      case 'image':   return expect(obj, 'to exhaustively satisfy', attachmentImage);
      case 'audio':   return expect(obj, 'to exhaustively satisfy', attachmentAudio);
      case 'general': return expect(obj, 'to exhaustively satisfy', attachmentGeneral);
    }
    return null;
  });

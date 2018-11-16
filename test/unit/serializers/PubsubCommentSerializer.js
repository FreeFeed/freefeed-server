/* eslint-env node, mocha */
import sinon from 'sinon';
import unexpected from 'unexpected';
import unexpectedSinon from 'unexpected-sinon';
import uuidv4 from 'uuid/v4';

import { dbAdapter, Comment, PubsubCommentSerializer, User } from '../../../app/models';


const expect = unexpected.clone();
expect.use(unexpectedSinon);

describe('PubsubCommentSerializer', () => {
  const userId = uuidv4();

  before(() => {
    const theFake = sinon.fake.returns(new User({ id: userId, intId: 1, username: 'test' }));
    sinon.replace(dbAdapter, 'getUserById', theFake);
  });

  after(() => {
    sinon.restore();
  });

  it('should serialize all fields of comment', async () => {
    const comment = new Comment({
      id:     uuidv4(),
      userId,
      postId: uuidv4(),
      body:   'This is a comment',
    });

    const serializedComment = await new PubsubCommentSerializer(comment).promiseToJSON();
    expect(serializedComment, 'to be an', 'object');
    expect(serializedComment.comments, 'to have key', 'createdBy');
  });
});

/* eslint-env node, mocha */
/* global $pg_database, $should */
import expect from 'unexpected';
import { isNull } from 'lodash';

import cleanDB from '../../dbCleaner';
import { dbAdapter, Comment, Post, User } from '../../../app/models';

describe('Comment', () => {
  before(() => cleanDB($pg_database));

  describe('#update()', () => {
    let userA, comment, post;

    beforeEach(async () => {
      userA = new User({
        username: 'Luna',
        password: 'password',
      });

      await userA.create();

      const postAttrs = { body: 'Post body' };
      post = await userA.newPost(postAttrs);
      await post.create();

      const commentAttrs = {
        body: 'Comment body',
        postId: post.id,
      };
      comment = await userA.newComment(commentAttrs);
      await comment.create();
    });

    afterEach(async () => {
      await dbAdapter.deleteUser(userA.id); // comment will be destroyed recursively
      userA = comment = post = null;
    });

    it('should update without error', async () => {
      const body = 'Body';
      const attrs = { body };

      await comment.update(attrs);

      const newComment = await dbAdapter.getCommentById(comment.id);
      newComment.body.should.eql(body);
    });
  });

  describe('#create()', () => {
    let user, post;

    beforeEach(async () => {
      user = new User({
        username: 'Luna',
        password: 'password',
      });

      await user.create();

      const postsTimelineId = await user.getPostsTimelineId();
      post = new Post({
        body: 'Post body',
        userId: user.id,
        timelineIds: [postsTimelineId],
      });

      await post.create();
    });

    afterEach(async () => {
      await dbAdapter.deleteUser(user.id); // post will be destroyed recursively
      user = post = null;
    });

    it('should create without error', async () => {
      const comment = new Comment({
        body: 'Comment body',
        userId: user.id,
        postId: post.id,
      });

      await comment.create();
      comment.should.be.an.instanceOf(Comment);
      comment.should.not.be.empty;
      comment.should.have.property('id');

      const newComment = await dbAdapter.getCommentById(comment.id);
      newComment.should.be.an.instanceOf(Comment);
      newComment.should.not.be.empty;
      newComment.should.have.property('id');
      newComment.id.should.eql(comment.id);
    });

    it('should ignore whitespaces in body', (done) => {
      const body = '   Comment body    ';
      const comment = new Comment({
        body,
        userId: user.id,
        postId: post.id,
      });

      comment
        .create()
        .then(() => dbAdapter.getCommentById(comment.id))
        .then((newComment) => {
          newComment.should.be.an.instanceOf(Comment);
          newComment.should.not.be.empty;
          newComment.should.have.property('id');
          newComment.id.should.eql(comment.id);
          newComment.body.should.eql(body.trim());
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('should not create with empty body', (done) => {
      const comment = new Comment({
        body: '',
        userId: user.id,
        postId: post.id,
      });

      comment.create().catch((e) => {
        e.message.should.eql('Comment text must not be empty');
        done();
      });
    });
  });

  describe('#findById()', () => {
    let user, post;

    beforeEach(async () => {
      user = new User({
        username: 'Luna',
        password: 'password',
      });

      await user.create();

      const postsTimelineId = await user.getPostsTimelineId();
      post = new Post({
        body: 'Post body',
        userId: user.id,
        timelineIds: [postsTimelineId],
      });

      await post.create();
    });

    afterEach(async () => {
      await dbAdapter.deleteUser(user.id); // post will be destroyed recursively
      user = post = null;
    });

    it('should find comment with a valid id', (done) => {
      const comment = new Comment({
        body: 'Comment body',
        userId: user.id,
        postId: post.id,
      });

      comment
        .create()
        .then(() => dbAdapter.getCommentById(comment.id))
        .then((newComment) => {
          newComment.should.be.an.instanceOf(Comment);
          newComment.should.not.be.empty;
          newComment.should.have.property('id');
          newComment.id.should.eql(comment.id);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('should not find comment with invalid id', (done) => {
      const identifier = 'comment:identifier';

      dbAdapter
        .getCommentById(identifier)
        .then((comment) => {
          $should.not.exist(comment);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
  });

  describe('#destroy()', () => {
    let userA, post;

    beforeEach(async () => {
      userA = new User({
        username: 'Luna',
        password: 'password',
      });

      await userA.create();

      const postAttrs = { body: 'Post body' };
      post = await userA.newPost(postAttrs);
      await post.create();

      const commentAttrs = {
        body: 'Comment body',
        postId: post.id,
      };
      const comment = await userA.newComment(commentAttrs);
      await comment.create();
    });

    afterEach(async () => {
      await dbAdapter.deleteUser(userA.id); // post will be destroyed recursively
      userA = post = null;
    });

    it('should destroy comment', async () => {
      let comments = await post.getComments();

      const [comment] = comments;
      await comment.destroy();

      const oldComment = await dbAdapter.getCommentById(comment.id);
      isNull(oldComment).should.be.true;

      comments = await post.getComments();
      comments.should.be.empty;
    });
  });

  describe('Comment numbers', () => {
    let userA, post;

    before(async () => {
      userA = new User({
        username: 'Luna',
        password: 'password',
      });

      await userA.create();

      const postAttrs = { body: 'Post body' };
      post = await userA.newPost(postAttrs);
      await post.create();
    });

    after(async () => {
      await dbAdapter.deleteUser(userA.id); // comment will be destroyed recursively
      userA = post = null;
    });

    it(`should create first comment with number 1`, async () => {
      const comment = await userA.newComment({ body: 'Comment body', postId: post.id });
      await comment.create();
      expect(comment.seqNumber, 'to be', 1);
      expect(await post.getComments(), 'to have length', 1);
    });

    it(`should create second comment with number 2`, async () => {
      const comment = await userA.newComment({ body: 'Comment body', postId: post.id });
      await comment.create();
      expect(comment.seqNumber, 'to be', 2);
      expect(await post.getComments(), 'to have length', 2);
    });

    it(`should remove first comment`, async () => {
      const [firstComment] = await dbAdapter.getPostComments(post.id);
      const deleted = await firstComment.destroy();
      expect(deleted, 'to be', true);
      expect(await post.getComments(), 'to have length', 1);
    });

    it(`should create next comment with number 3`, async () => {
      const comment = await userA.newComment({ body: 'Comment body', postId: post.id });
      await comment.create();
      expect(comment.seqNumber, 'to be', 3);
      expect(await post.getComments(), 'to have length', 2);
    });

    it(`should create next comment with number 4`, async () => {
      const comment = await userA.newComment({ body: 'Comment body', postId: post.id });
      await comment.create();
      expect(comment.seqNumber, 'to be', 4);
      expect(await post.getComments(), 'to have length', 3);
    });

    it(`should remove last comment`, async () => {
      const comments = await dbAdapter.getPostComments(post.id);
      const deleted = await comments.pop().destroy();
      expect(deleted, 'to be', true);
      expect(await post.getComments(), 'to have length', 2);
    });

    it(`should create next comment with number 4 again`, async () => {
      const comment = await userA.newComment({ body: 'Comment body', postId: post.id });
      await comment.create();
      expect(comment.seqNumber, 'to be', 4);
      expect(await post.getComments(), 'to have length', 3);
    });

    it(`should remove all comments and create a new comment with number 1`, async () => {
      let comments = await dbAdapter.getPostComments(post.id);
      await Promise.all(comments.map((c) => c.destroy()));

      comments = await dbAdapter.getPostComments(post.id);
      expect(comments, 'to be empty');
      expect(await post.getComments(), 'to have length', 0);
    });

    it(`should create a new comment with number 1`, async () => {
      const comment = await userA.newComment({ body: 'Comment body', postId: post.id });
      await comment.create();
      expect(comment.seqNumber, 'to be', 1);
      expect(await post.getComments(), 'to have length', 1);
    });
  });
});

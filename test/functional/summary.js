/* eslint-env node, mocha */
/* global $pg_database */
import cleanDB from '../dbCleaner'
import { getSingleton } from '../../app/app'
import { DummyPublisher } from '../../app/pubsub'
import { PubSub } from '../../app/models'

import * as funcTestHelper from './functional_test_helper'


describe('SummaryController', () => {
  before(async () => {
    await getSingleton();
    PubSub.setPublisher(new DummyPublisher());
  });

  describe('#generalSummary()', () => {
    const anon = {};
    let luna = {};
    let mars = {};
    let zeus = {};

    before(async () => {
      await cleanDB($pg_database);

      // Create three users
      [luna, mars, zeus] = await Promise.all([
        funcTestHelper.createUserAsync('luna', 'pw'),
        funcTestHelper.createUserAsync('mars', 'pw'),
        funcTestHelper.createUserAsync('zeus', 'pw'),
      ]);

      // We're all friends
      await Promise.all([
        funcTestHelper.subscribeToAsync(luna, mars),
        funcTestHelper.subscribeToAsync(luna, zeus),
        funcTestHelper.subscribeToAsync(mars, luna),
        funcTestHelper.subscribeToAsync(mars, zeus),
        funcTestHelper.subscribeToAsync(zeus, luna),
        funcTestHelper.subscribeToAsync(zeus, mars),
      ]);

      // Everyone's an author
      await Promise.all([
        funcTestHelper.createPostWithCommentsDisabled(luna, 'Hello from Luna', false),
        funcTestHelper.createPostWithCommentsDisabled(mars, 'Hey there from Mars', false),
        funcTestHelper.createPostWithCommentsDisabled(zeus, 'Good afternoon from Zeus', false),
        funcTestHelper.createPostWithCommentsDisabled(mars, 'Post #2 from Mars', false),
        funcTestHelper.createPostWithCommentsDisabled(zeus, 'Post #2 from Zeus', false),
      ]);

      // Luna doesn't like Zeus anymore :(
      await funcTestHelper.banUser(luna, zeus);
    });

    it('should return error for anonymous visitor', async () => {
      const response = await funcTestHelper.getSummary(anon);
      response.should.not.be.empty;
      response.should.have.property('err');
      response.err.should.be.eql('Unauthorized');
    });

    it('should return posts for authenticated user', async () => {
      const response = await funcTestHelper.getSummary(mars);
      response.should.not.be.empty;
      response.should.have.property('posts');
      response.posts.length.should.be.eql(5); // all 5 posts
    });

    it('should filter out posts from authors banned by viewer', async () => {
      const response = await funcTestHelper.getSummary(luna);
      response.should.not.be.empty;
      response.should.have.property('posts');
      response.posts.length.should.be.eql(3); // 5 posts minus 2 posts from Zeus banned by Luna
    });

    it('should filter out posts from authors who banned viewer', async () => {
      const response = await funcTestHelper.getSummary(zeus);
      response.should.not.be.empty;
      response.should.have.property('posts');
      response.posts.length.should.be.eql(4); // 5 posts minus 1 post from Luna who banned Zeus
    });
  });

  describe('#userSummary()', () => {
    const anon = {};
    let luna = {};
    let mars = {};
    let zeus = {};

    before(async () => {
      await cleanDB($pg_database);

      // Create three users
      [luna, mars, zeus] = await Promise.all([
        funcTestHelper.createUserAsync('luna', 'pw'),
        funcTestHelper.createUserAsync('mars', 'pw'),
        funcTestHelper.createUserAsync('zeus', 'pw'),
      ]);

      // Some of us are introverts
      await Promise.all([
        funcTestHelper.goProtected(mars),
        funcTestHelper.goPrivate(zeus),
      ]);

      // Some introverts, however, trust each other
      await funcTestHelper.sendRequestToSubscribe(mars, zeus);
      await funcTestHelper.acceptRequestAsync(zeus, mars);

      // Everyone's an author
      await Promise.all([
        funcTestHelper.createPostWithCommentsDisabled(luna, 'Post #1 from Luna', false),
        funcTestHelper.createPostWithCommentsDisabled(luna, 'Post #2 from Luna', false),
        funcTestHelper.createPostWithCommentsDisabled(mars, 'Post one from Mars', false),
        funcTestHelper.createPostWithCommentsDisabled(mars, 'Post two from Mars', false),
        funcTestHelper.createPostWithCommentsDisabled(zeus, 'Post first from Zeus', false),
        funcTestHelper.createPostWithCommentsDisabled(zeus, 'Post second from Zeus', false),
      ]);
    });

    it('should reply 404 when user not found', async () => {
      const response = await funcTestHelper.getSummary(anon, { username: 'chupacabra' });
      response.should.not.be.empty;
      response.should.have.property('err');
      response.err.should.be.eql('User "chupacabra" is not found');
    });

    it('should show public feeds to anonymous visitor', async () => {
      const response1 = await funcTestHelper.getSummary(anon, { username: 'luna' });
      response1.should.not.be.empty;
      response1.should.have.property('posts');
      response1.posts.length.should.be.eql(2);

      const response2 = await funcTestHelper.getSummary(anon, { username: 'mars' });
      response2.should.not.be.empty;
      response2.should.have.property('posts');
      response2.posts.length.should.be.eql(0);

      const response3 = await funcTestHelper.getSummary(anon, { username: 'zeus' });
      response3.should.not.be.empty;
      response3.should.have.property('posts');
      response3.posts.length.should.be.eql(0);
    });

    it('should show protected feeds to authenticated user', async () => {
      const response1 = await funcTestHelper.getSummary(luna, { username: 'luna' });
      response1.should.not.be.empty;
      response1.should.have.property('posts');
      response1.posts.length.should.be.eql(2);

      const response2 = await funcTestHelper.getSummary(luna, { username: 'mars' });
      response2.should.not.be.empty;
      response2.should.have.property('posts');
      response2.posts.length.should.be.eql(2);

      const response3 = await funcTestHelper.getSummary(luna, { username: 'zeus' });
      response3.should.not.be.empty;
      response3.should.have.property('posts');
      response3.posts.length.should.be.eql(0);
    });

    it('should show private feeds to subscribed user', async () => {
      const response = await funcTestHelper.getSummary(mars, { username: 'zeus' });
      response.should.not.be.empty;
      response.should.have.property('posts');
      response.posts.length.should.be.eql(2);
    });
  });
});

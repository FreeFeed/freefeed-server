/* eslint-env node, mocha */
/* global $pg_database */
import knexCleaner from 'knex-cleaner'

import { getSingleton } from '../../app/app'
import { DummyPublisher } from '../../app/pubsub'
import { PubSub } from '../../app/models'
import * as funcTestHelper from './functional_test_helper'

describe('SummaryController', () => {
  before(async () => {
    await getSingleton();
    PubSub.setPublisher(new DummyPublisher());
  });

  beforeEach(async () => {
    await knexCleaner.clean($pg_database)
  });

  describe('#generalSummary()', () => {
    const anon = {};
    let luna = {};
    let mars = {};
    let zeus = {};

    beforeEach(async () => {
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
});

/* eslint-env node, mocha */
/* global $pg_database */
/* eslint babel/semi: "error" */
import expect from 'unexpected';

import cleanDB from '../dbCleaner';

import { getSingleton } from '../../app/app';
import { DummyPublisher } from '../../app/pubsub';
import { PubSub } from '../../app/models';
import * as funcTestHelper from './functional_test_helper';


describe('SearchController', () => {
  before(async () => {
    await getSingleton();
    PubSub.setPublisher(new DummyPublisher());
    await cleanDB($pg_database);
  });

  describe('#search()', () => {
    let lunaContext = {};
    let marsContext = {};
    const anonContext = {};

    before(async () => {
      [lunaContext, marsContext] = await Promise.all([
        funcTestHelper.createUserAsync('luna', 'pw'),
        funcTestHelper.createUserAsync('mars', 'pw')
      ]);
      await Promise.all([
        funcTestHelper.createPostWithCommentsDisabled(lunaContext, 'hello from luna', false),
        funcTestHelper.createPostWithCommentsDisabled(lunaContext, '#hashTagA from luna', false),
        funcTestHelper.createPostWithCommentsDisabled(marsContext, 'hello from mars', false)
      ]);
      await funcTestHelper.createPostWithCommentsDisabled(lunaContext, '#hashtaga from luna again', false);
    });

    it('should search posts', async () => {
      const response = await funcTestHelper.performSearch(anonContext, 'hello');
      expect(response, 'to satisfy', { posts: [{}, {}] });
    });

    it('should search user\'s posts', async () => {
      const response = await funcTestHelper.performSearch(anonContext, 'from:luna hello');
      expect(response, 'to satisfy', { posts: [{ body: 'hello from luna' }] });
    });

    it('should search own posts with from:me', async () => {
      const response = await funcTestHelper.performSearch(lunaContext, 'from:me hello');
      expect(response, 'to satisfy', { posts: [{ body: 'hello from luna' }] });
    });

    it('should not search anonymously with from:me', async () => {
      const response = await funcTestHelper.performSearch(anonContext, 'from:me hello');
      expect(response, 'to have key', 'err');
    });

    it('should search hashtags with different casing', async () => {
      const response = await funcTestHelper.performSearch(anonContext, '#hashtaga');
      expect(response, 'to satisfy', { posts: [{}, {}] });
    });

    it('should return first page with isLastPage = false', async () => {
      const response = await funcTestHelper.performSearch(anonContext, 'from luna', { limit: 2, offset: 0 });
      expect(response, 'to satisfy', { isLastPage: false });
    });

    it('should return last page with isLastPage = true', async () => {
      const response = await funcTestHelper.performSearch(anonContext, 'from luna', { limit: 2, offset: 2 });
      expect(response, 'to satisfy', { isLastPage: true });
    });

    it('should return the only page with isLastPage = true', async () => {
      const response = await funcTestHelper.performSearch(anonContext, 'from luna');
      expect(response, 'to satisfy', { isLastPage: true });
    });

    describe('Luna is private', () => {
      before(async () => {
        await funcTestHelper.goPrivate(lunaContext);
      });

      it(`should search user's posts`, async () => {
        const response = await funcTestHelper.performSearch(lunaContext, 'from:luna hello');
        expect(response, 'to satisfy', { posts: [{ body: 'hello from luna' }] });
      });

      it('should search own posts with from:me', async () => {
        const response = await funcTestHelper.performSearch(lunaContext, 'from:me hello');
        expect(response, 'to satisfy', { posts: [{ body: 'hello from luna' }] });
      });
    });
  });
});

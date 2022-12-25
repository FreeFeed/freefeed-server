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
    let venusContext = {};
    const anonContext = {};

    before(async () => {
      [lunaContext, marsContext, venusContext] = await funcTestHelper.createTestUsers([
        'luna',
        'mars',
        'venus',
      ]);
      await Promise.all([
        funcTestHelper.createPostWithCommentsDisabled(lunaContext, 'hello from luna', false),
        funcTestHelper.createPostWithCommentsDisabled(lunaContext, '#hashTagA from luna', false),
        funcTestHelper.createPostWithCommentsDisabled(marsContext, 'hello from mars', false),
      ]);
      await funcTestHelper.createPostWithCommentsDisabled(
        lunaContext,
        '#hashtaga from luna again',
        false,
      );
      await funcTestHelper.createPostWithCommentsDisabled(
        marsContext,
        'É apenas uma publicação de testes'.normalize('NFD'),
        false,
      );
    });

    it('should search posts', async () => {
      const response = await funcTestHelper.performSearch(venusContext, 'hello');
      expect(response, 'to satisfy', { posts: [{}, {}] });
    });

    it('should return empty response on empty query', async () => {
      const response = await funcTestHelper.performSearch(venusContext, '');
      expect(response, 'to satisfy', { posts: [] });
    });

    it('should search posts by non-normalized unicode query', async () => {
      const response = await funcTestHelper.performSearch(
        venusContext,
        '"publicação"'.normalize('NFD'),
      );
      expect(response, 'to satisfy', { posts: [{}] });
    });

    it("should search user's posts", async () => {
      const response = await funcTestHelper.performSearch(venusContext, 'from:luna hello');
      expect(response, 'to satisfy', { posts: [{ body: 'hello from luna' }] });
    });

    it('should search own posts with from:me', async () => {
      const response = await funcTestHelper.performSearch(lunaContext, 'from:me hello');
      expect(response, 'to satisfy', { posts: [{ body: 'hello from luna' }] });
    });

    // Anonymous search is disabled
    xit('should not search anonymously with from:me', async () => {
      const response = await funcTestHelper.performSearch(venusContext, 'from:me hello');
      expect(response, 'to have key', 'err');
    });

    it('should search hashtags with different casing', async () => {
      const response = await funcTestHelper.performSearch(venusContext, '#hashtaga');
      expect(response, 'to satisfy', { posts: [{}, {}] });
    });

    it('should return first page with isLastPage = false', async () => {
      const response = await funcTestHelper.performSearch(venusContext, 'from luna', {
        limit: 2,
        offset: 0,
      });
      expect(response, 'to satisfy', { isLastPage: false });
    });

    it('should return last page with isLastPage = true', async () => {
      const response = await funcTestHelper.performSearch(venusContext, 'from luna', {
        limit: 2,
        offset: 2,
      });
      expect(response, 'to satisfy', { isLastPage: true });
    });

    it('should return the only page with isLastPage = true', async () => {
      const response = await funcTestHelper.performSearch(venusContext, 'from luna');
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

    describe('There is a group', () => {
      let group;
      before(async () => {
        group = await funcTestHelper.createGroupAsync(lunaContext, 'lunagroup');
        await funcTestHelper.subscribeToAsync(marsContext, group);
        await Promise.all([
          funcTestHelper.createAndReturnPostToFeed(
            group,
            lunaContext,
            'hello from luna to lunagroup',
          ),
          funcTestHelper.createAndReturnPostToFeed(
            group,
            marsContext,
            'hello from mars to lunagroup',
          ),
        ]);
      });

      it('should find only post to group', async () => {
        await expect(
          funcTestHelper.performSearch(venusContext, 'from:luna group:lunagroup hello'),
          'when fulfilled',
          'to satisfy',
          { posts: [{ body: 'hello from luna to lunagroup' }] },
        );
        await expect(
          funcTestHelper.performSearch(lunaContext, 'from:me group:lunagroup hello'),
          'when fulfilled',
          'to satisfy',
          { posts: [{ body: 'hello from luna to lunagroup' }] },
        );
      });

      // Anonymous search is disabled
      xdescribe('Group is protected, Luna is public', () => {
        before(async () => {
          await funcTestHelper.goPublic(lunaContext);
          await funcTestHelper.groupToProtected(group.group, lunaContext);
        });

        it('should not search for group posts as anonymous', async () => {
          await expect(
            funcTestHelper.performSearch(anonContext, 'group:lunagroup hello'),
            'when fulfilled',
            'to satisfy',
            { posts: [] },
          );
        });

        it('should not search for user posts in group as anonymous', async () => {
          await expect(
            funcTestHelper.performSearch(anonContext, 'from:luna hello'),
            'when fulfilled',
            'to satisfy',
            { posts: [{ body: 'hello from luna' }] },
          );
        });
      });
    });
  });
});

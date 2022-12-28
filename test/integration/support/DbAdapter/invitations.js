/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../../../dbCleaner';
import { User, dbAdapter, Comment } from '../../../../app/models';
import { DENIED, TOO_OFTEN, TOO_SOON } from '../../../../app/models/invitations';

/**
 * @typedef {import('../../../../app/models').Post} Post
 * @typedef {import('../../../../app/support/types/invitations').InvitationCreationCriterion} InvitationCreationCriterion
 */

describe('Invitations DB trait', () => {
  before(() => cleanDB($pg_database));

  describe('canUserCreateInvitation', () => {
    /** @type {User} */
    let luna;
    /** @type {User} */
    let mars;
    /** @type {InvitationCreationCriterion[]} */
    let criteria = [];

    before(async () => {
      luna = new User({ username: 'luna', password: 'pw' });
      await luna.create();
      mars = new User({ username: 'mars', password: 'pw' });
      await mars.create();
    });

    it(`should allow to create invite if no restrictions`, async () => {
      const result = await dbAdapter.canUserCreateInvitation(luna.id, []);
      expect(result, 'to be null');
    });

    describe('minAccountAge', () => {
      before(() => {
        criteria = [
          ['minAccountAge', { age: 'P1D' }], // 1 day
        ];
      });

      it(`should not allow to fresh user to create invite`, async () => {
        const result = await dbAdapter.canUserCreateInvitation(luna.id, criteria);
        expect(result, 'to be', TOO_SOON);
      });

      it(`should allow to older user to create invite`, async () => {
        await dbAdapter.database.raw(
          `update users set created_at = created_at - interval '1 day' where uid = :userId`,
          { userId: luna.id },
        );
        const result = await dbAdapter.canUserCreateInvitation(luna.id, criteria);
        expect(result, 'to be null');
      });
    });

    describe('minPostsCreated', () => {
      before(() => {
        criteria = [['minPostsCreated', { count: 2 }]];
      });

      it(`should not allow to user without posts to create invite`, async () => {
        const result = await dbAdapter.canUserCreateInvitation(luna.id, criteria);
        expect(result, 'to be', TOO_SOON);
      });

      it(`should not allow to user with 1 posts to create invite`, async () => {
        const p = await luna.newPost({ body: 'Post' });
        await p.create();
        const result = await dbAdapter.canUserCreateInvitation(luna.id, criteria);
        expect(result, 'to be', TOO_SOON);
      });

      it(`should allow to user with 2 posts to create invite`, async () => {
        const p = await luna.newPost({ body: 'Post' });
        await p.create();
        const result = await dbAdapter.canUserCreateInvitation(luna.id, criteria);
        expect(result, 'to be null');
      });
    });

    describe('minCommentsFromOthers', () => {
      /** @type {Post} */
      let post;
      before(async () => {
        criteria = [['minCommentsFromOthers', { count: 2 }]];
        post = await luna.newPost({ body: 'Post' });
        await post.create();
      });

      it(`should not allow to user with posts without comments posts to create invite`, async () => {
        const result = await dbAdapter.canUserCreateInvitation(luna.id, criteria);
        expect(result, 'to be', TOO_SOON);
      });

      it(`should not allow to user with posts with only own comments to create invite`, async () => {
        await new Comment({ postId: post.id, userId: luna.id, body: 'Comment' }).create();
        await new Comment({ postId: post.id, userId: luna.id, body: 'Comment' }).create();
        const result = await dbAdapter.canUserCreateInvitation(luna.id, criteria);
        expect(result, 'to be', TOO_SOON);
      });

      it(`should not allow to user with posts with 1 other user comments to create invite`, async () => {
        await new Comment({ postId: post.id, userId: mars.id, body: 'Comment' }).create();
        const result = await dbAdapter.canUserCreateInvitation(luna.id, criteria);
        expect(result, 'to be', TOO_SOON);
      });

      it(`should allow to user with posts with 2 other user comments to create invite`, async () => {
        await new Comment({ postId: post.id, userId: mars.id, body: 'Comment' }).create();
        const result = await dbAdapter.canUserCreateInvitation(luna.id, criteria);
        expect(result, 'to be null');
      });
    });

    describe('maxInvitesCreated', () => {
      const invData = {
        message: 'Hello',
        lang: 'en',
        singleUse: true,
        users: [],
        groups: [],
      };
      before(() => {
        criteria = [['maxInvitesCreated', { count: 2, interval: 'P1D' }]];
      });

      it(`should allow to user without invites to create new invite`, async () => {
        const result = await dbAdapter.canUserCreateInvitation(luna.id, criteria);
        expect(result, 'to be null');
      });

      it(`should allow to user with 1 invite to create new invite`, async () => {
        await luna.createInvitation(invData);
        const result = await dbAdapter.canUserCreateInvitation(luna.id, criteria);
        expect(result, 'to be null');
      });

      it(`should not allow to user with 2 invites to create new invite`, async () => {
        await luna.createInvitation(invData);
        const result = await dbAdapter.canUserCreateInvitation(luna.id, criteria);
        expect(result, 'to be', TOO_OFTEN);
      });

      it(`should allow to user with 2 older invites to create new invite`, async () => {
        await dbAdapter.database.raw(
          `update invitations set created_at = created_at - interval '1 day'`,
        );
        const result = await dbAdapter.canUserCreateInvitation(luna.id, criteria);
        expect(result, 'to be null');
      });
    });

    describe('Disable invites', () => {
      before(() => dbAdapter.setInvitesDisabledForUser(luna.id, true));
      after(() => dbAdapter.setInvitesDisabledForUser(luna.id, true));

      it(`should not allow to user with disabled invitations to create new invite`, async () => {
        const result = await dbAdapter.canUserCreateInvitation(luna.id, []);
        expect(result, 'to be', DENIED);
      });
    });
  });
});

/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../../../dbCleaner';
import { User, dbAdapter } from '../../../../app/models';

describe('Invitations in User model', () => {
  /** @type {User} */
  let luna;

  before(async () => {
    await cleanDB($pg_database);
    luna = new User({ username: 'luna', password: 'pw' });
    await luna.create();
    // Reload Luna from database
    luna = await dbAdapter.getUserById(luna.id);
  });

  it(`should have empty invitationId for Luna`, async () => {
    expect(luna.invitationId, 'to be null');
    expect(await luna.getInvitation(), 'to be null');
  });

  describe(`Luna invites Mars`, () => {
    /** @type {User} */
    let mars;
    /** @type {number} */
    let invitationId;
    before(async () => {
      const [secureId] = await dbAdapter.createInvitation(
        luna.intId,
        'Hello, Mars',
        'en',
        true,
        [],
        [],
      );
      ({ id: invitationId } = await dbAdapter.getInvitation(secureId));

      mars = new User({ username: 'mars', password: 'pw', invitationId });
      await mars.create();
      // Reload Mars from database
      mars = await dbAdapter.getUserById(mars.id);
    });

    it(`should have non-empty invitationId for Mars`, () => {
      expect(mars.invitationId, 'to be', invitationId);
    });

    it(`should Mars be invited by Luna`, async () => {
      expect(await mars.getInvitation(), 'to satisfy', { author: luna.intId });
    });
  });
});

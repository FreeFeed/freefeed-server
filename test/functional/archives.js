/* eslint-env node, mocha */
/* global $pg_database */
import fetch from 'node-fetch';
import knexCleaner from 'knex-cleaner';
import expect from 'unexpected';

import { getSingleton } from '../../app/app';
import { DummyPublisher } from '../../app/pubsub';
import { PubSub, dbAdapter } from '../../app/models';
import * as testHelper from '../functional/functional_test_helper';

describe('Archives', () => {
  let app;
  before(async () => {
    app = await getSingleton();
    PubSub.setPublisher(new DummyPublisher());
  })
  beforeEach(async () => {
    await knexCleaner.clean($pg_database)
  })

  describe('Luna has archive, Mars hasn\'t but has record, Venus hasn\'t anything', () => {
    let luna, mars, venus;
    const viaSources = [
      {
        name:  'FriendFeed',
        url:   'http://friendfeed.com',
        count: 1000,
      },
      {
        name:  'FriendFeed2',
        url:   'http://friendfeed2.com',
        count: 200,
      },
    ];
    beforeEach(async () => {
      luna = await testHelper.createUserAsync('luna', 'pw');
      mars = await testHelper.createUserAsync('mars', 'pw');
      venus = await testHelper.createUserAsync('venus', 'pw');
      await Promise.all([
        dbAdapter.setUserArchiveParams(luna.user.id, 'oldluna', {
          has_archive: true,
          via_sources: JSON.stringify(viaSources),
        }),
        dbAdapter.setUserArchiveParams(mars.user.id, 'oldmars', { has_archive: false }),
      ]);
    });

    it('should return \'archive\' field in whoami for Luna', async () => {
      const whoAmI = await getWhoAmI(app, luna);
      expect(whoAmI, 'to satisfy', { users: { privateMeta: { archives: {} } } });
      expect(whoAmI.users.privateMeta.archives, 'to exhaustively satisfy', {
        old_username:               'oldluna',
        has_archive:                true,
        via_sources:                viaSources,
        recovery_status:            0,
        restore_comments_and_likes: false,
      });
    });

    it('should return \'archive\' field in whoami for Mars', async () => {
      const whoAmI = await getWhoAmI(app, mars);
      expect(whoAmI, 'to satisfy', { users: { privateMeta: { archives: {} } } });
      expect(whoAmI.users.privateMeta.archives, 'to exhaustively satisfy', {
        old_username:               'oldmars',
        has_archive:                false,
        via_sources:                [],
        recovery_status:            0,
        restore_comments_and_likes: false,
      });
    });

    it('should not return \'archive\' field in whoami for Venus', async () => {
      const whoAmI = await getWhoAmI(app, venus);
      expect(whoAmI, 'to satisfy', { users: { privateMeta: { } } });
      expect(whoAmI.users.privateMeta, 'to not have key', 'archives');
    });

    it('should start archive restoration for Luna', async () => {
      const resp = await postRestoration(app, luna, {
        disable_comments: false,
        via_restore:      ['http://friendfeed.com'],
      });
      expect(resp.status, 'to equal', 202);

      const whoAmI = await getWhoAmI(app, luna);
      expect(whoAmI.users.privateMeta.archives, 'to satisfy', { recovery_status: 1 });
    });

    it('should not start archive restoration for Mars', async () => {
      const resp = await postRestoration(app, mars, {});
      expect(resp.status, 'to equal', 403);
    });

    it('should not start archive restoration for Venus', async () => {
      const resp = await postRestoration(app, venus);
      expect(resp.status, 'to equal', 403);
    });

    it('should not start archive restoration for anonymous', async () => {
      const resp = await postRestoration(app);
      expect(resp.status, 'to equal', 401);
    });

    it('should allow Luna to restore activities', async () => {
      const resp = await putActivities(app, luna);
      expect(resp.status, 'to equal', 202);

      const whoAmI = await getWhoAmI(app, luna);
      expect(whoAmI.users.privateMeta.archives, 'to satisfy', { restore_comments_and_likes: true });
    });

    it('should allow Mars to restore activities', async () => {
      const resp = await putActivities(app, mars);
      expect(resp.status, 'to equal', 202);

      const whoAmI = await getWhoAmI(app, mars);
      expect(whoAmI.users.privateMeta.archives, 'to satisfy', { restore_comments_and_likes: true });
    });

    it('should not allow Venus to restore activities', async () => {
      const resp = await putActivities(app, venus);
      expect(resp.status, 'to equal', 403);
    });

    it('should not allow anonymous to restore activities', async () => {
      const resp = await putActivities(app);
      expect(resp.status, 'to equal', 401);
    });

    it('should not allow Luna to cancel activities restoration', async () => {
      const resp = await putActivities(app, luna);
      expect(resp.status, 'to equal', 202);

      const resp2 = await putActivities(app, luna, false);
      expect(resp2.status, 'to equal', 403);

      const whoAmI = await getWhoAmI(app, luna);
      expect(whoAmI.users.privateMeta.archives, 'to satisfy', { restore_comments_and_likes: true });
    });
  });

  describe('Luna has a restored post', () => {
    const oldName = 'deadbeef';
    const badName = 'baddbeef';
    let luna, post;
    beforeEach(async () => {
      luna = await testHelper.createUserAsync('luna', 'pw');
      post = await testHelper.createAndReturnPost(luna, 'Luna post');
      await dbAdapter.setOldPostName(post.id, oldName)
    });

    it('should return new post UID by it\'s old name', async () => {
      const resp = await fetch(`${app.context.config.host}/v2/archives/post-by-old-name/${encodeURIComponent(oldName)}`);
      expect(resp.status, 'to equal', 200);

      expect(await resp.json(), 'to exhaustively satisfy', { postId: post.id });
    });

    it('should not return new post UID by bad old name', async () => {
      const resp = await fetch(`${app.context.config.host}/v2/archives/post-by-old-name/${encodeURIComponent(badName)}`);
      expect(resp.status, 'to equal', 404);
    });
  });
});

async function getWhoAmI(app, user) {
  return await fetch(
    `${app.context.config.host}/v2/users/whoami`,
    { headers: { 'X-Authentication-Token': user.authToken } }
  ).then((r) => r.json());
}

async function postRestoration(app, user = null, body = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (user) {
    headers['X-Authentication-Token'] = user.authToken;
  }
  return await fetch(
    `${app.context.config.host}/v2/archives/restoration`,
    {
      method: 'POST',
      headers,
      body:   JSON.stringify(body),
    }
  );
}

async function putActivities(app, user = null, restore = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (user) {
    headers['X-Authentication-Token'] = user.authToken;
  }
  return await fetch(
    `${app.context.config.host}/v2/archives/activities`,
    {
      method: 'PUT',
      headers,
      body:   JSON.stringify({ restore }),
    }
  );
}

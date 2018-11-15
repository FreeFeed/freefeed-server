/* eslint-env node, mocha */
/* global $pg_database */
import _ from 'lodash';
import fetch from 'node-fetch';
import expect from 'unexpected';

import cleanDB from '../dbCleaner';
import { getSingleton } from '../../app/app';
import { DummyPublisher } from '../../app/pubsub';
import { PubSub } from '../../app/models';
import * as testHelper from '../functional/functional_test_helper';
import { allGroupsResponse } from './schemaV2-helper';


describe('All groups', () => {
  let app;
  before(async () => {
    app = await getSingleton();
    PubSub.setPublisher(new DummyPublisher());
    await cleanDB($pg_database);
  });

  describe('There are three groups: Pubic, Protected and Private. Luna, Mars and Venus wrote posts to these groups', () => {
    let luna, mars, venus,
      privateGroup, protectedGroup, pubicGroup,
      anonResponse, authResponse;

    before(async () => {
      // Create users
      [
        luna,
        mars,
        venus,
      ] = await Promise.all([
        testHelper.createUserAsync('luna', 'pw'),
        testHelper.createUserAsync('mars', 'pw'),
        testHelper.createUserAsync('venus', 'pw'),
      ]);

      // Create groups
      [
        { group: privateGroup },
        { group: protectedGroup },
        { group: pubicGroup },
      ] = await Promise.all([
        testHelper.createGroupAsync(luna, 'private-group', 'Private Group'),
        testHelper.createGroupAsync(luna, 'protected-group', 'Protected Group'),
        testHelper.createGroupAsync(luna, 'public-group', 'Public Group'),
      ]);

      // Subscribe Mars and Venus to groups
      await Promise.all([
        testHelper.subscribeToAsync(mars,  privateGroup),
        testHelper.subscribeToAsync(venus, privateGroup),
        testHelper.subscribeToAsync(mars,  protectedGroup),
        testHelper.subscribeToAsync(venus, protectedGroup),
        testHelper.subscribeToAsync(mars,  pubicGroup),
        testHelper.subscribeToAsync(venus, pubicGroup),
      ]);

      // Make groups private/protected
      await Promise.all([
        testHelper.groupToPrivate(privateGroup, luna),
        testHelper.groupToProtected(protectedGroup, luna),
      ]);

      // Write posts
      await Promise.all([
        testHelper.createAndReturnPostToFeed(pubicGroup, luna, 'Post by Luna to Public group'),
        testHelper.createAndReturnPostToFeed(protectedGroup, luna, 'Post by Luna to Protected group'),
        testHelper.createAndReturnPostToFeed(privateGroup, luna, 'Post by Luna to Private group'),

        testHelper.createAndReturnPostToFeed([pubicGroup, protectedGroup], mars, 'Post by Mars to Public and Protected groups'),

        testHelper.createAndReturnPostToFeed(protectedGroup, venus, 'Post by Venus to Protected group'),
        testHelper.createAndReturnPostToFeed(privateGroup, venus, 'Post by Venus to Private group'),
      ]);

      // Fetch allGroups info
      [
        anonResponse,
        authResponse,
      ] = await Promise.all([
        getAllGroups(app),
        getAllGroups(app, venus),
      ]);
    });

    describe('Anonymous request to /v2/allGroups', () => {
      let response;
      before(() => response = anonResponse);

      it('should return a proper structure', () => expect(response, 'to exhaustively satisfy', allGroupsResponse));
      it('should return only one group',     () => expect(response.groups, 'to have length', 1));
      it('it should be Public group',        () => expect(response.groups[0].id, 'to equal', pubicGroup.id));
      it('shoud be 3 subscribers in Public group', () => expect(response.groups[0].subscribers, 'to equal', 3));
      it('shoud be about 2 posts in Public group', () => expect(response.groups[0].postsByMonth, 'to be close to', 2, 1e-5));
      it('Public group shoud have author variety about 50%', () => {
        expect(response.groups[0].authorsVariety, 'to be close to', 1 / 2, 1e-5);
      });
    });

    describe('Authorized request to /v2/allGroups', () => {
      let response, pubicGroupResp, protectedGroupResp;
      before(() => {
        response = authResponse;

        if (response.groups && _.isArray(response.groups)) {
          pubicGroupResp     = response.groups.find((g) => g.id === pubicGroup.id);
          protectedGroupResp = response.groups.find((g) => g.id === protectedGroup.id);
        }
      });

      it('should return a proper structure', () => expect(response, 'to exhaustively satisfy', allGroupsResponse));
      it('should return two groups',         () => expect(response.groups, 'to have length', 2));
      it('it should be Public and Protected groups', () => {
        expect(_.map(response.groups, 'id'), 'to contain', pubicGroup.id, protectedGroup.id);
      });
      it('shoud be 3 subscribers in Public group',    () => expect(pubicGroupResp.subscribers, 'to equal', 3));
      it('shoud be 3 subscribers in Protected group', () => expect(protectedGroupResp.subscribers, 'to equal', 3));
      it('shoud be about 2 posts in Public group',    () => expect(pubicGroupResp.postsByMonth, 'to be close to', 2, 1e-5));
      it('shoud be about 3 posts in Protected group', () => expect(protectedGroupResp.postsByMonth, 'to be close to', 3, 1e-5));
      it('Public group shoud have author variety about 50%',    () => {
        expect(pubicGroupResp.authorsVariety, 'to be close to', 1 / 2, 1e-5);
      });
      it('Protected group shoud have author variety about 50%', () => {
        expect(protectedGroupResp.authorsVariety, 'to be close to', 2 / 3, 1e-5);
      });
    });
  });
});

async function getAllGroups(app, user = null) {
  const headers = user ? { 'X-Authentication-Token': user.authToken } : {};
  return await fetch(`${app.context.config.host}/v2/allGroups`, { headers })
    .then((r) => r.json());
}

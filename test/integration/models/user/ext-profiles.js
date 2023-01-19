/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../../../dbCleaner';
import { User } from '../../../../app/models';

describe('External authentication profiles', () => {
  let luna, mars;
  let lunaFBProfile, lunaFBProfile2;

  before(async () => {
    await cleanDB($pg_database);
    luna = new User({ username: 'luna', password: 'pw' });
    mars = new User({ username: 'mars', password: 'pw' });
    await Promise.all([luna.create(), mars.create()]);
  });

  it('should connect external profile to Luna', async () => {
    const params = {
      provider: 'facebook',
      externalId: '111',
      title: 'Luna Lovegood',
    };
    lunaFBProfile = await luna.addOrUpdateExtProfile(params);
    expect(lunaFBProfile, 'to equal', {
      ...lunaFBProfile, // id and createdAt fields
      ...params,
      userId: luna.id,
    });
  });

  it('should not allow to Mars to connect to the Luna profile', async () => {
    const params = {
      provider: 'facebook',
      externalId: '111',
      title: 'Mark Antony',
    };
    const profile = await mars.addOrUpdateExtProfile(params);
    expect(profile, 'to be null');
  });

  it('should allow to Luna to update her profile', async () => {
    const params = {
      provider: 'facebook',
      externalId: '111',
      title: 'Luna Maximoff',
    };
    const prevProfile = lunaFBProfile;
    lunaFBProfile = await luna.addOrUpdateExtProfile(params);
    expect(lunaFBProfile, 'to equal', { ...prevProfile, ...params });
  });

  it('should not allow to add profile from unsupported provider', async () => {
    const params = {
      provider: 'googleplus',
      externalId: '111',
      title: 'Luna Lovegood',
    };
    const test = luna.addOrUpdateExtProfile(params);
    await expect(test, 'to be rejected with', /not supported/);
  });

  it('should return user by profile', async () => {
    const user = await User.getByExtProfile(lunaFBProfile);
    expect(user, 'not to be null');
    expect(user.id, 'to be', luna.id);
  });

  describe('Luna have another FB profile', () => {
    before(async () => {
      lunaFBProfile2 = await luna.addOrUpdateExtProfile({
        provider: 'facebook',
        externalId: '112',
        title: 'Luna Lovegood #2',
      });
      expect(lunaFBProfile2, 'not to be null');
    });

    it('should return list of profiles', async () => {
      const profiles = await luna.getExtProfiles();
      expect(profiles, 'to equal', [lunaFBProfile2, lunaFBProfile]);
    });

    it('should not allow to Mars to remove Luna profile', async () => {
      const result = await mars.removeExtProfile(lunaFBProfile.id);
      expect(result, 'to be false');
    });

    it('should allow to Luna to remove Luna profile', async () => {
      const result = await luna.removeExtProfile(lunaFBProfile.id);
      expect(result, 'to be true');
    });

    it('should return modified list of profiles', async () => {
      const profiles = await luna.getExtProfiles();
      expect(profiles, 'to equal', [lunaFBProfile2]);
    });
  });
});

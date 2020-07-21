/* eslint-env node, mocha */
/* global $pg_database */
import unexpected from 'unexpected';
import unexpectedDate from 'unexpected-date';
import { pick, sortBy } from 'lodash';
import { DateTime } from 'luxon';
import { simpleParser } from 'mailparser';
import config from 'config';

import cleanDB from '../../dbCleaner';
import { User, dbAdapter } from '../../../app/models';
import {
  GONE_SUSPENDED,
  GONE_COOLDOWN,
  GONE_DELETION,
  GONE_DELETED,
} from '../../../app/models/user';
import {
  USER_COOLDOWN_START,
  USER_COOLDOWN_REMINDER,
  USER_DELETION_START,
  USER_DELETE_DATA,
} from '../../../app/jobs/user-gone';
import { initJobProcessing } from '../../../app/jobs';
import { addMailListener } from '../../../lib/mailer';


const expect = unexpected.clone();
expect.use(unexpectedDate);


describe(`User's 'gone' status`, () => {
  describe(`Clean gone user's fields`, () => {
    let luna;

    before(async () => {
      await cleanDB($pg_database);

      luna = new User({
        username:   'luna',
        screenName: 'Luna Lovegood',
        email:      'luna@lovegood.good',
        password:   'pw',
      });
      await luna.create();
    });

    it(`should return Lunas's props from db`, async () => {
      const luna1 = await dbAdapter.getUserById(luna.id);
      expect(
        pick(luna1, ['username', 'screenName', 'email']),
        'to equal',
        pick(luna, ['username', 'screenName', 'email'])
      );
    });

    it(`should return cleaned Lunas's props when Luna is gone`, async () => {
      const [, now] = await Promise.all([
        luna.setGoneStatus(GONE_SUSPENDED),
        dbAdapter.now(),
      ]);
      const luna1 = await dbAdapter.getUserById(luna.id);
      expect(luna1, 'to satisfy', {
        username:    'luna',
        screenName:  'luna',
        email:       '',
        isPrivate:   '1',
        isProtected: '1',
        goneStatus:  GONE_SUSPENDED,
        goneAt:      expect.it('to be close to', now),
      });
    });

    it(`should return initial Lunas's props when Luna isn't gone anymore`, async () => {
      await luna.setGoneStatus(null);
      const luna1 = await dbAdapter.getUserById(luna.id);
      expect(
        pick(luna1, ['username', 'screenName', 'email']),
        'to equal',
        pick(luna, ['username', 'screenName', 'email'])
      );
    });
  });

  describe(`Gone user's deferred jobs`, () => {
    let luna, jobManager, capturedMail = null;
    let removeMailListener = () => null;

    before(async () => {
      await cleanDB($pg_database);

      luna = new User({
        username:   'luna',
        screenName: 'Luna Lovegood',
        email:      'luna@lovegood.good',
        password:   'pw',
      });
      await luna.create();

      jobManager = initJobProcessing();
      removeMailListener = addMailListener((r) => (capturedMail = r));
    });

    after(removeMailListener);

    beforeEach(() => (capturedMail = null));

    it(`should create start job when user changes status to GONE_COOLDOWN`, async () => {
      const [, now] = await Promise.all([
        luna.setGoneStatus(GONE_COOLDOWN),
        dbAdapter.now(),
      ]);

      const jobs = await dbAdapter.getAllJobs();
      expect(jobs, 'to satisfy', [{
        name:     USER_COOLDOWN_START,
        payload:  { id: luna.id, goneAt: luna.goneAt.getTime() },
        unlockAt: expect.it('to be close to', now),
      }]);
    });

    it(`should send email to user's real address`, async () => {
      await jobManager.fetchAndProcess();

      expect(capturedMail, 'to satisfy', { envelope: { to: ['luna@lovegood.good'] } });
      const parsedMail = await simpleParser(capturedMail.response);
      expect(parsedMail, 'to satisfy', {
        to:      { text: 'luna <luna@lovegood.good>' },
        subject: 'Your account has been suspended',
      });
    });

    it(`should create next deletion jobs after the first job processed`, async () => {
      const reminderTime = DateTime.fromJSDate(luna.goneAt)
        .setZone(config.ianaTimeZone)
        // Schedule reminder to 9:00
        .startOf('day')
        .plus({ days: config.userDeletion.reminderDays, hours: 9 })
        .toJSDate();

      const deletionTime = DateTime.fromJSDate(luna.goneAt)
        .plus({ days: config.userDeletion.cooldownDays })
        .toJSDate();

      const jobs = await dbAdapter.getAllJobs();
      expect(sortBy(jobs, 'unlockAt'), 'to satisfy', [
        {
          name:     USER_COOLDOWN_REMINDER,
          payload:  { id: luna.id, goneAt: luna.goneAt.getTime() },
          unlockAt: expect.it('to be close to', reminderTime),
        },
        {
          name:     USER_DELETION_START,
          payload:  { id: luna.id, goneAt: luna.goneAt.getTime() },
          unlockAt: expect.it('to be close to', deletionTime),
        },
      ]);
    });

    it(`should send a reminder email`, async () => {
      const jobs = await dbAdapter.getAllJobs();
      const reminderJob = jobs.find((job) => job.name === USER_COOLDOWN_REMINDER);
      // Manually unlock reminder job
      await reminderJob.setUnlockAt(0);

      await jobManager.fetchAndProcess();

      expect(capturedMail, 'to satisfy', { envelope: { to: ['luna@lovegood.good'] } });
      const parsedMail = await simpleParser(capturedMail.response);
      expect(parsedMail, 'to satisfy', {
        to:      { text: 'luna <luna@lovegood.good>' },
        subject: 'Your account data will be deleted in a few days',
      });
    });

    it(`should switch user to GONE_DELETION status`, async () => {
      const jobs = await dbAdapter.getAllJobs();
      expect(jobs, 'to satisfy', [{ name: USER_DELETION_START }]);
      const [deletionJob] = jobs;
      // Manually unlock deletion job
      await deletionJob.setUnlockAt(0);

      await jobManager.fetchAndProcess();

      const user = await dbAdapter.getUserById(luna.id);

      expect(user.goneStatus, 'to be', GONE_DELETION);

      const newJobs = await dbAdapter.getAllJobs();
      expect(newJobs, 'to satisfy', [{ name: USER_DELETE_DATA }]);
    });

    it(`should delete user data`, async () => {
      await jobManager.fetchAndProcess();

      const newJobs = await dbAdapter.getAllJobs();
      expect(newJobs, 'to be empty');

      const user = await dbAdapter.getUserById(luna.id);
      // Check that the user profile is really cleaned
      expect(user, 'to satisfy', { goneStatus: GONE_DELETED, hiddenEmail: '' });

      expect(capturedMail, 'to satisfy', { envelope: { to: ['luna@lovegood.good'] } });
      const parsedMail = await simpleParser(capturedMail.response);
      expect(parsedMail, 'to satisfy', {
        to:      { text: 'luna <luna@lovegood.good>' },
        subject: 'Your account data has been deleted',
      });
    });
  });
});

import config from 'config';
import { DateTime } from 'luxon';

import { Job } from '../models';
import { GONE_COOLDOWN, GONE_DELETION, GONE_DELETED } from '../models/user';
import Mailer from '../../lib/mailer';
import { deleteAllUserData } from '../support/user-deletion';

// User deletion process
export const USER_COOLDOWN_START = 'USER_COOLDOWN_START';
export const USER_COOLDOWN_REMINDER = 'USER_COOLDOWN_REMINDER';
export const USER_DELETION_START = 'USER_DELETION_START';
export const USER_DELETE_DATA = 'USER_DELETE_DATA';

// Job creators
export function userCooldownStart(user) {
  return Job.create(
    USER_COOLDOWN_START,
    {
      id: user.id,
      goneAt: user.goneAt.getTime(),
    },
    { uniqKey: user.id },
  );
}

export function userDataDeletionStart(user) {
  return Job.create(
    USER_DELETE_DATA,
    { id: user.id, email: user.hiddenEmail },
    { uniqKey: user.id },
  );
}

/**
 * Job handlers definitions
 *
 * @param {JobManager} jobManager
 */
export function initHandlers(jobManager) {
  jobManager.on(
    USER_COOLDOWN_START,
    checkUserStatus(jobManager.dbAdapter, GONE_COOLDOWN, async (user) => {
      // Send email to user
      await Mailer.sendMail(
        // User is gone so the regular .email field is empty
        { screenName: user.screenName, email: user.hiddenEmail },
        'Your account has been suspended',
        { user, deletionDate: deletionDate(user) },
        `${config.appRoot}/app/scripts/views/mailer/user-cooldown-start.ejs`,
      );

      // Schedule the next steps
      await Promise.all([
        Job.create(
          USER_COOLDOWN_REMINDER,
          { id: user.id, goneAt: user.goneAt.getTime() },
          { unlockAt: reminderDate(user), uniqKey: user.id },
        ),
        Job.create(
          USER_DELETION_START,
          { id: user.id, goneAt: user.goneAt.getTime() },
          { unlockAt: deletionDate(user), uniqKey: user.id },
        ),
      ]);
    }),
  );

  jobManager.on(
    USER_COOLDOWN_REMINDER,
    checkUserStatus(jobManager.dbAdapter, GONE_COOLDOWN, async (user) => {
      // Send email to user
      await Mailer.sendMail(
        // User is gone so the regular .email field is empty
        { screenName: user.screenName, email: user.hiddenEmail },
        'Your account data will be deleted in a few days',
        { user, deletionDate: deletionDate(user) },
        `${config.appRoot}/app/scripts/views/mailer/user-cooldown-reminder.ejs`,
      );
    }),
  );

  jobManager.on(
    USER_DELETION_START,
    checkUserStatus(jobManager.dbAdapter, GONE_COOLDOWN, (user) =>
      user.setGoneStatus(GONE_DELETION),
    ),
  );

  jobManager.on(USER_DELETE_DATA, async (job) => {
    const maxTTL = 200; // sec
    await job.setUnlockAt(maxTTL * 1.5);

    const { id, email } = job.payload;

    await deleteAllUserData(
      jobManager.dbAdapter,
      id,
      DateTime.local().plus({ seconds: maxTTL }).toJSDate(),
    );

    const user = await jobManager.dbAdapter.getUserById(id);

    if (user.goneStatus === GONE_DELETED) {
      // All data has been deleted, send email and finish job
      await Mailer.sendMail(
        // User is gone so the regular .email field is empty
        { screenName: user.screenName, email },
        'Your account has been deleted',
        { user },
        `${config.appRoot}/app/scripts/views/mailer/user-cooldown-finish.ejs`,
      );
      // We are done
      return;
    }

    // Repeat this job if we are not done
    await job.keep();
  });
}

// Helpers

const checkUserStatus = (dbAdapter, desiredStatus, handler) => async (job) => {
  const { id, goneAt } = job.payload;
  const user = await dbAdapter.getUserById(id);

  if (user.goneStatus !== desiredStatus || user.goneAt?.getTime() !== goneAt) {
    // User status has been changed after the job creation so skip this job
    return;
  }

  await handler(user, job);
};

export function reminderDate(user) {
  return (
    DateTime.fromJSDate(user.goneAt)
      .setZone(config.ianaTimeZone)
      // Schedule reminder to 9:00
      .startOf('day')
      .plus({ days: config.userDeletion.reminderDays, hours: 9 })
      .toJSDate()
  );
}

export function deletionDate(user) {
  return DateTime.fromJSDate(user.goneAt)
    .plus({ days: config.userDeletion.cooldownDays })
    .toJSDate();
}

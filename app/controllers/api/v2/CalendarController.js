import config from 'config';
import compose from 'koa-compose';

import { ValidationException, NotFoundException } from '../../../support/exceptions';
import { dbAdapter } from '../../../models';
import { serializeFeed } from '../../../serializers/v2/post';
import { monitored, authRequired, targetUserRequired } from '../../middlewares';

const CALENDAR_START_YEAR = 2000;

const pad = (int) => String(int).padStart(2, '0');

const isValidTimezoneName = async (tz) => {
  const exists = await dbAdapter.checkTimezoneExists(tz);

  return exists;
};

const validateInputs = async ({ year, month, day, tz }) => {
  const thisYear = new Date().getFullYear();

  if (!year || year < CALENDAR_START_YEAR || year > thisYear + 1) {
    throw new ValidationException('Invalid year');
  }

  if (typeof month !== 'undefined' && (month < 1 || month > 12)) {
    throw new ValidationException('Invalid month');
  }

  if (typeof day !== 'undefined' && (day < 1 || day > 31)) {
    throw new ValidationException('Invalid day');
  }

  if (!(await isValidTimezoneName(tz))) {
    throw new ValidationException('Invalid timezone');
  }
};

export const getMyCalendarDatePosts = compose([
  authRequired(),
  targetUserRequired(),
  monitored('calendar.datePosts'),
  async (ctx) => {
    const { targetUser, user } = ctx.state;
    const currentUserId = user.id;
    const { year, month, day } = ctx.params;
    const offset = parseInt(ctx.request.query.offset, 10) || 0;
    const limit = 30;
    const tz = ctx.request.query.tz || config.ianaTimeZone;

    if (currentUserId !== targetUser.id) {
      throw new NotFoundException();
    }

    const yearAsInt = parseInt(year, 10);
    const monthAsInt = parseInt(month, 10);
    const dayAsInt = parseInt(day, 10);

    await validateInputs({ year: yearAsInt, month: monthAsInt, day: dayAsInt, tz });

    const mm = pad(monthAsInt);
    const dd = pad(dayAsInt);
    const dayStart = `${year}-${mm}-${dd} 00:00:00.000 ${tz}`;
    const dayEnd = `${year}-${mm}-${dd} 23:59:59.999 ${tz}`;

    const foundPostsIds = await dbAdapter.getMyCalendarDatePosts(
      currentUserId,
      dayStart,
      dayEnd,
      tz,
      offset,
      limit + 1,
    );

    const isLastPage = foundPostsIds.length <= limit;

    if (!isLastPage) {
      foundPostsIds.length = limit;
    }

    const feed = await serializeFeed(foundPostsIds, currentUserId, null, { isLastPage });

    const previousDay = await dbAdapter.getMyCalendarFirstDayWithPostsBeforeDate(
      currentUserId,
      dayStart,
      tz,
    );

    const nextDay = await dbAdapter.getMyCalendarFirstDayWithPostsAfterDate(
      currentUserId,
      dayEnd,
      tz,
    );

    ctx.body = {
      ...feed,
      nextDay,
      previousDay,
    };
  },
]);

export const getMyCalendarMonthDays = compose([
  authRequired(),
  targetUserRequired(),
  monitored('calendar.monthDays'),
  async (ctx) => {
    const { targetUser, user } = ctx.state;
    const currentUserId = user.id;
    const { year, month } = ctx.params;
    const tz = ctx.request.query.tz || config.ianaTimeZone;

    if (currentUserId !== targetUser.id) {
      throw new NotFoundException();
    }

    const yearAsInt = parseInt(year, 10);
    const monthAsInt = parseInt(month, 10);

    await validateInputs({ year: yearAsInt, month: monthAsInt, tz });

    const nextYear = monthAsInt === 12 ? yearAsInt + 1 : yearAsInt;
    const nextMonth = monthAsInt === 12 ? 1 : monthAsInt + 1;

    const mm = pad(monthAsInt);
    const mmNext = pad(nextMonth);
    const fromDate = `${yearAsInt}-${mm}-01 00:00:00.000 ${tz}`;
    const toDate = `${nextYear}-${mmNext}-01 00:00:00.000 ${tz}`;

    const daysWithPosts = await dbAdapter.getMyCalendarRangeDaysWithPosts(
      currentUserId,
      fromDate,
      toDate,
      tz,
    );

    const previousDay = await dbAdapter.getMyCalendarFirstDayWithPostsBeforeDate(
      currentUserId,
      fromDate,
      tz,
    );

    const nextDay = await dbAdapter.getMyCalendarFirstDayWithPostsAfterDate(
      currentUserId,
      toDate,
      tz,
    );

    ctx.body = {
      previousDay,
      nextDay,
      days: daysWithPosts,
    };
  },
]);

export const getMyCalendarYearDays = compose([
  authRequired(),
  targetUserRequired(),
  monitored('calendar.yearDays'),
  async (ctx) => {
    const { targetUser, user } = ctx.state;
    const currentUserId = user.id;
    const { year } = ctx.params;
    const tz = ctx.request.query.tz || config.ianaTimeZone;

    if (currentUserId !== targetUser.id) {
      throw new NotFoundException();
    }

    const yearAsInt = parseInt(year, 10);

    await validateInputs({ year: yearAsInt, tz });

    const fromDate = `${yearAsInt}-01-01 00:00:00.000 ${tz}`;
    const toDate = `${yearAsInt + 1}-01-01 00:00:00.000 ${tz}`;

    const daysWithPosts = await dbAdapter.getMyCalendarRangeDaysWithPosts(
      currentUserId,
      fromDate,
      toDate,
      tz,
    );

    ctx.body = {
      days: daysWithPosts,
    };
  },
]);

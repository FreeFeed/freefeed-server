import compose from 'koa-compose';

import { ValidationException, NotFoundException } from '../../../support/exceptions';
import { dbAdapter } from '../../../models';
import { serializeFeed } from '../../../serializers/v2/post';
import { monitored, authRequired, targetUserRequired } from '../../middlewares';

const thisYear = new Date().getFullYear();
const EARLIEST_YEAR = 2006;
const SERVER_TIMEZONE = 'UTC';

const pad = (int) => String(int).padStart(2, '0');

// accepts zero-indexed month number (0=January), returns 0-th day of next month
const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

const isValidTimezoneName = (tz) => {
  try {
    if (!Intl || !Intl.DateTimeFormat().resolvedOptions().timeZone) {
      return false;
    }

    if (typeof tz !== 'string') {
      return false;
    }

    // throws an error if timezone is not valid
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch (error) {
    return false;
  }
};

const validateInputs = (year, month, day, tz) => {
  if (!year || year < EARLIEST_YEAR || year > thisYear) {
    throw new ValidationException('Invalid year');
  }

  if (typeof month !== 'undefined' && (month < 1 || month > 12)) {
    throw new ValidationException('Invalid month');
  }

  if (typeof day !== 'undefined' && (day < 1 || day > 31)) {
    throw new ValidationException('Invalid day');
  }

  if (!isValidTimezoneName(tz)) {
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
    const tz = ctx.request.query.tz || SERVER_TIMEZONE;

    if (currentUserId !== targetUser.id) {
      throw new NotFoundException();
    }

    const yearAsInt = parseInt(year, 10);
    const monthAsInt = parseInt(month, 10);
    const dayAsInt = parseInt(day, 10);

    validateInputs(yearAsInt, monthAsInt, dayAsInt, tz);

    const mm = pad(monthAsInt);
    const dd = pad(dayAsInt);
    const date = `${year}-${mm}-${dd}`;

    const foundPostsIds = await dbAdapter.getMyCalendarDatePosts(
      currentUserId,
      date,
      tz,
      offset,
      limit,
    );
    const isLastPage = foundPostsIds.length < limit;

    ctx.body = await serializeFeed(foundPostsIds, currentUserId, null, { isLastPage });
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
    const tz = ctx.request.query.tz || SERVER_TIMEZONE;

    if (currentUserId !== targetUser.id) {
      throw new NotFoundException();
    }

    const yearAsInt = parseInt(year, 10);
    const monthAsInt = parseInt(month, 10);

    validateInputs(yearAsInt, monthAsInt, undefined, tz);

    const mm = pad(monthAsInt);
    const fromDate = `${yearAsInt}-${mm}-01 00:00:00.000`;
    const toDate = `${yearAsInt}-${mm}-${daysInMonth(yearAsInt, monthAsInt - 1)} 23:59:59.999`;

    const daysWithPosts = await dbAdapter.getMyCalendarRangeDaysWithPosts(
      currentUserId,
      fromDate,
      toDate,
      tz,
    );

    ctx.body = {
      year,
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
    const tz = ctx.request.query.tz || SERVER_TIMEZONE;

    if (currentUserId !== targetUser.id) {
      throw new NotFoundException();
    }

    const yearAsInt = parseInt(year, 10);

    validateInputs(yearAsInt, undefined, undefined, tz);

    const fromDate = `${yearAsInt}-01-01 00:00:00.000`;
    const toDate = `${yearAsInt}-12-31} 23:59:59.999`;

    const daysWithPosts = await dbAdapter.getMyCalendarRangeDaysWithPosts(
      currentUserId,
      fromDate,
      toDate,
      tz,
    );

    ctx.body = {
      year,
      days: daysWithPosts,
    };
  },
]);

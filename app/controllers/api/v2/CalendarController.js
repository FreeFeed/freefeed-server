import compose from 'koa-compose';

import { ValidationException, NotFoundException } from '../../../support/exceptions';
import { dbAdapter } from '../../../models';
import { serializeFeed } from '../../../serializers/v2/post';
import { monitored, authRequired, targetUserRequired } from '../../middlewares';

const thisYear = new Date().getFullYear();
const EARLIEST_YEAR = 2006;
const SERVER_TIMEZONE = 'UTC';

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

export const getMyCalendarDatePosts = compose([
  authRequired(),
  targetUserRequired(),
  monitored('calendar.datePosts'),
  async (ctx) => {
    const { targetUser, user } = ctx.state;
    const currentUserId = user.id;
    const { date } = ctx.params;
    const offset = parseInt(ctx.request.query.offset, 10) || 0;
    const limit = 30;
    const tz = ctx.request.query.tz || SERVER_TIMEZONE;

    if (currentUserId !== targetUser.id) {
      throw new NotFoundException();
    }

    if (!isValidTimezoneName(tz)) {
      throw new ValidationException('Invalid timezone');
    }

    const kindaValidDate = /^20\d\d-(0[1-9]|1[012])-(0[1-9]|[12]\d|3[01])$/i.test(date);

    if (!kindaValidDate) {
      throw new ValidationException('Invalid date');
    }

    const yearAsInt = parseInt(date.slice(0, 4), 10);

    if (!yearAsInt || yearAsInt < EARLIEST_YEAR || yearAsInt > thisYear) {
      throw new ValidationException('Invalid year');
    }

    const foundPostsIds = await dbAdapter.getMyCalendarPostsIds(
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

    if (!isValidTimezoneName(tz)) {
      throw new ValidationException('Invalid timezone');
    }

    const yearAsInt = parseInt(year, 10);

    if (!yearAsInt || yearAsInt < EARLIEST_YEAR || yearAsInt > thisYear) {
      throw new ValidationException('Invalid year');
    }

    const calendarYearDays = await dbAdapter.getMyCalendarYearDays(currentUserId, yearAsInt, tz);

    ctx.body = {
      year,
      days: calendarYearDays,
    };
  },
]);

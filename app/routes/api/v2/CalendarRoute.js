import {
  getMyCalendarDatePosts,
  getMyCalendarMonthDays,
  getMyCalendarYearDays,
} from '../../../controllers/api/v2/CalendarController';

export default function addRoutes(app) {
  app.get('/calendar/:username/:year/:month/:day', getMyCalendarDatePosts);
  app.get('/calendar/:username/:year/:month', getMyCalendarMonthDays);
  app.get('/calendar/:username/:year', getMyCalendarYearDays);
}

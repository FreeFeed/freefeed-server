import {
  getMyCalendarDatePosts,
  getMyCalendarYearDays,
} from '../../../controllers/api/v2/CalendarController';

export default function addRoutes(app) {
  app.get('/calendar/:username/date/:date', getMyCalendarDatePosts);
  app.get('/calendar/:username/year/:year', getMyCalendarYearDays);
}

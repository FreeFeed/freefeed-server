import { generalSummary, userSummary } from '../../../controllers/api/v2/SummaryController';

export default function addRoutes(app) {
  app.get('/v2/summary/:days', generalSummary);
  app.get('/v2/summary/:username/:days', userSummary);
}

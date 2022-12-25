import { generalSummary, userSummary } from '../../../controllers/api/v2/SummaryController';

export default function addRoutes(app) {
  app.get('/summary/:days', generalSummary);
  app.get('/summary/:username/:days', userSummary);
}

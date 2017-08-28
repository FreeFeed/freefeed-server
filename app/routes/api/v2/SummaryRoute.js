import SummaryController from '../../../controllers/api/v2/SummaryController'

export default function addRoutes(app) {
  app.get('/v2/summary/:days', SummaryController.generalSummary);
}

import ArchivesController from '../../../controllers/api/v2/ArchivesController'

export default function addRoutes(app) {
  const controller = new ArchivesController(app);

  app.post('/v2/archives/start', controller.start);
}

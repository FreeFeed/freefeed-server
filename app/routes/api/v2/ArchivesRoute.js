import ArchivesController from '../../../controllers/api/v2/ArchivesController'

export default function addRoutes(app) {
  const controller = new ArchivesController(app);

  app.post('/v2/archives/restoration', controller.restoration);
  app.put('/v2/archives/activities', controller.activities);
  app.get('/v2/archives/post-by-old-name/:name', controller.postByOldName);
}

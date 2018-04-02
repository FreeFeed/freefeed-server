import { restoration, activities, postByOldName } from '../../../controllers/api/v2/ArchivesController'

export default function addRoutes(app) {
  app.post('/v2/archives/restoration',           restoration);
  app.put('/v2/archives/activities',             activities);
  app.get('/v2/archives/post-by-old-name/:name', postByOldName);
}

import {
  restoration,
  activities,
  postByOldName,
} from '../../../controllers/api/v2/ArchivesController';

export default function addRoutes(app) {
  app.post('/archives/restoration', restoration);
  app.put('/archives/activities', activities);
  app.get('/archives/post-by-old-name/:name', postByOldName);
}

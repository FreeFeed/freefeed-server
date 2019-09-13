import { create } from '../../../controllers/api/v1/BookmarkletController';

export default function addRoutes(app) {
  app.post('/v1/bookmarklet', create);
}

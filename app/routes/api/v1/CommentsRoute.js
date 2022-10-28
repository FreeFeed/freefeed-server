import { create, update, destroy, getById } from '../../../controllers/api/v1/CommentsController';

export default function addRoutes(app) {
  app.post('/comments', create);
  app.put('/comments/:commentId', update);
  app.delete('/comments/:commentId', destroy);
  app.get('/comments/:commentId', getById);
}

import {
  create,
  update,
  destroy,
  getById,
  getByIds,
} from '../../../controllers/api/v1/CommentsController';

export default function addRoutes(app) {
  app.post('/comments', create);
  app.put('/comments/:commentId', update);
  app.delete('/comments/:commentId', destroy);
  app.get('/comments/:commentId', getById);
  // We use POST here because this method can accept many comment IDs
  app.post('/comments/byIds', getByIds);
}

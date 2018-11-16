import { create, update, destroy } from '../../../controllers/api/v1/CommentsController';


export default function addRoutes(app) {
  app.post('/v1/comments',              create);
  app.put('/v1/comments/:commentId',    update);
  app.delete('/v1/comments/:commentId', destroy);
}

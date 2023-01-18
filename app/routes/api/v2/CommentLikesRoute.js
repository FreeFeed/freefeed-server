import { CommentLikesController } from '../../../controllers';

export default function addRoutes(app) {
  app.post('/comments/:commentId/like', CommentLikesController.like);
  app.post('/comments/:commentId/unlike', CommentLikesController.unlike);
  app.get('/comments/:commentId/likes', CommentLikesController.likes);
}

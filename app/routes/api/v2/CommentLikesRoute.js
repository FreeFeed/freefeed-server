import { CommentLikesController } from '../../../controllers';

export default function addRoutes(app) {
  app.post('/v2/comments/:commentId/like', CommentLikesController.like);
  app.post('/v2/comments/:commentId/unlike', CommentLikesController.unlike);
  app.get('/v2/comments/:commentId/likes', CommentLikesController.likes);
}

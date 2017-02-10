import { CommentLikesController } from '../../../controllers'


export default function addRoutes(app) {
  app.post('/v2/comments/:commentId/like', CommentLikesController.like)
}

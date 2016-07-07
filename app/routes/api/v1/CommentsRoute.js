import { CommentsController } from '../../../controllers'


export default function addRoutes(app) {
  app.post('/v1/comments',            CommentsController.create)
  app.put('/v1/comments/:commentId', CommentsController.update)
  app.delete('/v1/comments/:commentId', CommentsController.destroy)
}

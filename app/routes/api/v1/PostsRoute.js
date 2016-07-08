import { PostsController } from '../../../controllers'


export default function addRoutes(app) {
  app.post('/v1/posts',                PostsController.create)
  app.get('/v1/posts/:postId',        PostsController.show)
  app.put('/v1/posts/:postId',        PostsController.update)
  app.delete('/v1/posts/:postId',        PostsController.destroy)
  app.post('/v1/posts/:postId/like',   PostsController.like)
  app.post('/v1/posts/:postId/unlike', PostsController.unlike)
  app.post('/v1/posts/:postId/hide',   PostsController.hide)
  app.post('/v1/posts/:postId/unhide', PostsController.unhide)
  app.post('/v1/posts/:postId/disableComments', PostsController.disableComments)
  app.post('/v1/posts/:postId/enableComments',  PostsController.enableComments)
}

import { PostsController } from '../../../controllers';

export default function addRoutes(app) {
  app.post('/posts', PostsController.create);
  app.put('/posts/:postId', PostsController.update);
  app.delete('/posts/:postId', PostsController.destroy);
  app.post('/posts/:postId/like', PostsController.like);
  app.post('/posts/:postId/unlike', PostsController.unlike);
  app.post('/posts/:postId/hide', PostsController.hide);
  app.post('/posts/:postId/unhide', PostsController.unhide);
  app.post('/posts/:postId/save', PostsController.save);
  app.delete('/posts/:postId/save', PostsController.unsave);
  app.post('/posts/:postId/disableComments', PostsController.disableComments);
  app.post('/posts/:postId/enableComments', PostsController.enableComments);
}

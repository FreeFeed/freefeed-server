import PostsController from '../../../controllers/api/v2/PostsController';

export default function addRoutes(app) {
  const controller = new PostsController();

  app.get('/v2/posts/:postId', controller.show);
}


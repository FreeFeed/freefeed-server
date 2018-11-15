import { show, opengraph } from '../../../controllers/api/v2/PostsController';


export default function addRoutes(app) {
  app.get('/v2/posts/:postId',           show);
  app.get('/v2/posts-opengraph/:postId', opengraph);
}


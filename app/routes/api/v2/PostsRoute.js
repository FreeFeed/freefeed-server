import { getBySeqNumber } from '../../../controllers/api/v1/CommentsController';
import { show, opengraph, getByIds, leave } from '../../../controllers/api/v2/PostsController';

export default function addRoutes(app) {
  app.get('/posts/:postId', show);
  app.get('/posts-opengraph/:postId', opengraph);
  app.get('/posts/:postId/comments/:seqNumber', getBySeqNumber);
  // We use POST here because this method can accept many post IDs
  app.post('/posts/byIds', getByIds);
  app.post('/posts/:postId/leave', leave);
}

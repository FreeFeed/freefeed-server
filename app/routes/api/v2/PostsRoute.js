import { getBySeqNumber } from '../../../controllers/api/v1/CommentsController';
import { show, opengraph, getByIds, leave } from '../../../controllers/api/v2/PostsController';

export default function addRoutes(app) {
  app.get('/v2/posts/:postId', show);
  app.get('/v2/posts-opengraph/:postId', opengraph);
  app.get('/v2/posts/:postId/comments/:seqNumber', getBySeqNumber);
  // We use POST here because this method can accept many post IDs
  app.post('/v2/posts/byIds', getByIds);
  app.post('/v2/posts/:postId/leave', leave);
}

import { getBySeqNumber } from '../../../controllers/api/v1/CommentsController';
import {
  show,
  opengraph,
  getByIds,
  leave,
  getReferringPosts,
  notifyOfAllComments,
} from '../../../controllers/api/v2/PostsController';
import { getTranslatedBody } from '../../../controllers/api/v2/TranslationController';

export default function addRoutes(app) {
  app.get('/posts/:postId', show);
  app.get('/posts/:postId/translated-body', getTranslatedBody);
  app.get('/posts/:postId/backlinks', getReferringPosts);
  app.get('/posts-opengraph/:postId', opengraph);
  app.get('/posts/:postId/comments/:seqNumber', getBySeqNumber);
  // We use POST here because this method can accept many post IDs
  app.post('/posts/byIds', getByIds);
  app.post('/posts/:postId/leave', leave);
  app.post('/posts/:postId/notifyOfAllComments', notifyOfAllComments);
}

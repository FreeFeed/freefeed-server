import type { Router } from '@koa/router';

import { create, getById } from '../../../controllers/api/v2/ArticlesController';

export default function addRoutes(app: Router) {
  app.post('/articles', create);
  app.get('/articles/:articleId', getById);
}

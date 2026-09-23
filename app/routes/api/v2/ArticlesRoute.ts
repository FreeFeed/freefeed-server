import type { Router } from '@koa/router';

import { create } from '../../../controllers/api/v2/ArticlesController';

export default function addRoutes(app: Router) {
  app.post('/articles', create);
}

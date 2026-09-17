import type { Router } from '@koa/router';

import { undo } from '../../../controllers/api/v2/UndoController';

export default function addRoutes(app: Router) {
  app.post('/undo/:subject', undo);
}

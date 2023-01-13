import Router from '@koa/router';

import { listUsers, promoteModerator } from '../../../controllers/api/admin/AdminController';
import { adminRolesRequired } from '../../../controllers/middlewares/admin-only';
import { ROLE_ADMIN } from '../../../models/admins';

export default function addRoutes(router: Router) {
  const r = new Router();
  r.use(adminRolesRequired(ROLE_ADMIN));

  r.get('/members', listUsers);
  r.post('/members/:username/promote', promoteModerator(true));
  r.post('/members/:username/demote', promoteModerator(false));

  router.use(r.routes(), r.allowedMethods());
}

import type { Router } from '@koa/router';
import type { DefaultStateExtends } from 'koa';

import { listUsers, promoteModerator } from '../../../controllers/api/admin/AdminController';
import { adminRolesRequired } from '../../../controllers/middlewares/admin-only';
import { ROLE_ADMIN } from '../../../models/admins';
import type { AppContext } from '../../../support/types';

export default function addRoutes(router: Router<DefaultStateExtends, AppContext>) {
  const mw = adminRolesRequired(ROLE_ADMIN);

  router.get('/members', mw, listUsers);
  router.post('/members/:username/promote', mw, promoteModerator(true));
  router.post('/members/:username/demote', mw, promoteModerator(false));
}

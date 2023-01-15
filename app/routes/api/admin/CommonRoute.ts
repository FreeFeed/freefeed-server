import Router from '@koa/router';
import { DefaultState } from 'koa';

import { journal, whoAmI } from '../../../controllers/api/admin/CommonController';
import { adminRolesRequired } from '../../../controllers/middlewares/admin-only';
import { AppContext } from '../../../support/types';

export default function addRoutes(router: Router<DefaultState, AppContext>) {
  const mw = adminRolesRequired();

  router.get('/whoami', mw, whoAmI);
  router.get('/journal', mw, journal);
}

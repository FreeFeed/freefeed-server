import Router from '@koa/router';

import { whoAmI } from '../../../controllers/api/admin/CommonController';
import { adminRolesRequired } from '../../../controllers/middlewares/admin-only';

export default function addRoutes(router: Router) {
  const r = new Router();
  r.use(adminRolesRequired());

  r.get('/whoami', whoAmI);

  router.use(r.routes(), r.allowedMethods());
}

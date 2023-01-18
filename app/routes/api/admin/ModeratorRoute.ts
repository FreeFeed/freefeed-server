import Router from '@koa/router';
import { DefaultState } from 'koa';

import { adminRolesRequired } from '../../../controllers/middlewares/admin-only';
import { ROLE_MODERATOR } from '../../../models/admins';
import {
  freezeUser,
  listAll,
  listFrozen,
  unfreezeUser,
  userInfo,
} from '../../../controllers/api/admin/ModeratorController';
import { AppContext } from '../../../support/types';

export default function addRoutes(router: Router<DefaultState, AppContext>) {
  const mw = adminRolesRequired(ROLE_MODERATOR);

  router.get('/users', mw, listAll);
  router.get('/users/frozen', mw, listFrozen);
  router.get('/users/:username/info', mw, userInfo);
  router.post('/users/:username/freeze', mw, freezeUser);
  router.post('/users/:username/unfreeze', mw, unfreezeUser);
}

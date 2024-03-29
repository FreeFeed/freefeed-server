import Router from '@koa/router';
import { DefaultState } from 'koa';

import { adminRolesRequired } from '../../../controllers/middlewares/admin-only';
import { ROLE_MODERATOR } from '../../../models/admins';
import {
  disableInvitesForUser,
  freezeUser,
  listAll,
  listFrozen,
  suspendUser,
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
  router.post('/users/:username/suspend', mw, suspendUser(true));
  router.post('/users/:username/unsuspend', mw, suspendUser(false));
  router.post('/users/:username/disable-invites', mw, disableInvitesForUser(true));
  router.post('/users/:username/enable-invites', mw, disableInvitesForUser(false));
}

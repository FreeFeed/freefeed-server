import { GroupsControllerV2 } from '../../../controllers';

export default function addRoutes(app) {
  app.get('/v2/managedGroups', GroupsControllerV2.managedGroups);
  app.get('/v2/allGroups', GroupsControllerV2.allGroups);
  app.get('/v2/groups/:groupName/blockedUsers', GroupsControllerV2.getBlockedUsers);
  app.post('/v2/groups/:groupName/block/:userName', GroupsControllerV2.blockUser);
  app.post('/v2/groups/:groupName/unblock/:userName', GroupsControllerV2.unblockUser);
}

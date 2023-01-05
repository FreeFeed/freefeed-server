import { GroupsControllerV2 } from '../../../controllers';

export default function addRoutes(app) {
  app.get('/managedGroups', GroupsControllerV2.managedGroups);
  app.get('/allGroups', GroupsControllerV2.allGroups);
  app.get('/groups/:groupName/blockedUsers', GroupsControllerV2.getBlockedUsers);
  app.post('/groups/:groupName/block/:userName', GroupsControllerV2.blockUser);
  app.post('/groups/:groupName/unblock/:userName', GroupsControllerV2.unblockUser);
  app.post('/groups/:groupName/disableBans', GroupsControllerV2.disableBans(true));
  app.post('/groups/:groupName/enableBans', GroupsControllerV2.disableBans(false));
}

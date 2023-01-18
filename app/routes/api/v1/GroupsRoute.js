import { GroupsController } from '../../../controllers';

export default function addRoutes(app) {
  app.post('/groups', GroupsController.create);
  app.post('/groups/sudo', GroupsController.sudoCreate);
  app.post('/groups/:groupName/updateProfilePicture', GroupsController.updateProfilePicture);
  app.post('/groups/:groupName/subscribers/:adminName/admin', GroupsController.admin);
  app.post('/groups/:groupName/subscribers/:adminName/unadmin', GroupsController.unadmin);
  app.post('/groups/:groupName/sendRequest', GroupsController.sendRequest);
  app.post('/groups/:groupName/acceptRequest/:userName', GroupsController.acceptRequest);
  app.post('/groups/:groupName/rejectRequest/:userName', GroupsController.rejectRequest);
  app.post(
    '/groups/:groupName/unsubscribeFromGroup/:userName',
    GroupsController.unsubscribeFromGroup,
  );
}

import { GroupsController } from '../../../controllers'


export default function addRoutes(app) {
  app.post('/v1/groups', GroupsController.create)
  app.post('/v1/groups/sudo', GroupsController.sudoCreate)
  app.post('/v1/groups/:groupName/updateProfilePicture', GroupsController.updateProfilePicture)
  app.post('/v1/groups/:groupName/subscribers/:adminName/admin', GroupsController.admin)
  app.post('/v1/groups/:groupName/subscribers/:adminName/unadmin', GroupsController.unadmin)
  app.post('/v1/groups/:groupName/sendRequest', GroupsController.sendRequest)
  app.post('/v1/groups/:groupName/acceptRequest/:userName', GroupsController.acceptRequest)
  app.post('/v1/groups/:groupName/rejectRequest/:userName', GroupsController.rejectRequest)
  app.post('/v1/groups/:groupName/unsubscribeFromGroup/:userName', GroupsController.unsubscribeFromGroup)
}

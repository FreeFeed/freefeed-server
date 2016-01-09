import { GroupsController } from '../../../controllers'


export default function addRoutes(app) {
  app.post('/v1/groups', GroupsController.create)
  app.post('/v1/groups/sudo', GroupsController.sudoCreate)
  app.post('/v1/groups/:groupName/updateProfilePicture', GroupsController.updateProfilePicture)
  app.post('/v1/groups/:groupName/subscribers/:adminName/admin', GroupsController.admin)
  app.post('/v1/groups/:groupName/subscribers/:adminName/unadmin', GroupsController.unadmin)
}

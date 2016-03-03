import { GroupsControllerV2 } from '../../../controllers'


export default function addRoutes(app) {
  app.get('/v2/managedGroups', GroupsControllerV2.managedGroups)
}

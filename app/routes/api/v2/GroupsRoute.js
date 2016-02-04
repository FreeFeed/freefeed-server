import { GroupsControllerV2 } from '../../../controllers'


export default function addRoutes(app) {
  app.get('/v2/groupRequests', GroupsControllerV2.groupRequests)
}

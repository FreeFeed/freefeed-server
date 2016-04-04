import { UsersControllerV2 } from '../../../controllers'


export default function addRoutes(app) {
  app.get( '/v2/users/blockedByMe', UsersControllerV2.blockedByMe)
}

import { UsersControllerV2 } from '../../../controllers'


export default function addRoutes(app) {
  app.get('/v2/users/blockedByMe', UsersControllerV2.blockedByMe)
  app.get('/v2/users/getUnreadDirectsNumber', UsersControllerV2.getUnreadDirectsNumber)
  app.get('/v2/users/markAllDirectsAsRead', UsersControllerV2.markAllDirectsAsRead)
  app.get('/v2/users/whoami', UsersControllerV2.whoAmI)
}

import { RequestsControllerV2 } from '../../../controllers'


export default function addRoutes(app) {
  app.post('/v2/requests/:followedUserName/revoke', RequestsControllerV2.revokeRequest)
}

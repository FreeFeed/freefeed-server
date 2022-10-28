import { RequestsControllerV2 } from '../../../controllers';

export default function addRoutes(app) {
  app.post('/requests/:followedUserName/revoke', RequestsControllerV2.revokeRequest);
}

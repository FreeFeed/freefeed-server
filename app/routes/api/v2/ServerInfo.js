import { serverInfo } from '../../../controllers/api/v2/ServerInfoController'


export default function addRoutes(app) {
  app.get('/v2/server-info', serverInfo);
}

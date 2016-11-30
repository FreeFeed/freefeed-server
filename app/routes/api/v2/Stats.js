import { StatsControllerV2 } from '../../../controllers'


export default function addRoutes(app) {
  app.get('/v2/stats', StatsControllerV2.stats);
}

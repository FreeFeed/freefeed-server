import { StatsControllerV2 } from '../../../controllers';

export default function addRoutes(app) {
  app.get('/stats', StatsControllerV2.stats);
}

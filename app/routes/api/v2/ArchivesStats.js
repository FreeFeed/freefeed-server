import { ArchivesStatsControllerV2 } from '../../../controllers';

export default function addRoutes(app) {
  app.get('/archives-stats', ArchivesStatsControllerV2.stats);
}

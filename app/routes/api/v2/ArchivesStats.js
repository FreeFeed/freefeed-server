import { ArchivesStatsControllerV2 } from '../../../controllers'


export default function addRoutes(app) {
  app.get('/v2/archives-stats', ArchivesStatsControllerV2.stats);
}

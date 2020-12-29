import { dbAdapter } from '../../../models';

export default class ArchivesStatsController {
  static async stats(ctx) {
    ctx.body = await dbAdapter.getArchivesStats();
  }
}

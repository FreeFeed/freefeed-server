export default class ArchivesStatsController {
  static async stats(ctx) {
    ctx.body = await ctx.modelRegistry.dbAdapter.getArchivesStats();
  }
}

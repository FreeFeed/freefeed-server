export default class EventsController {
  static async myEvents(ctx) {
    if (!ctx.state.user) {
      ctx.status = 403;
      ctx.body = { err: 'Unauthorized' };
      return;
    }

    ctx.body = { Notifications: [] };
  }
}


export default class CommentLikesController {
  static async like(ctx) {
    if (!ctx.state.user) {
      ctx.status = 403;
      ctx.body = { err: 'Unauthorized' };
      return
    }

    ctx.body = { likes: [] };
  }
}

import { ForbiddenException, NotFoundException, ServerErrorException } from '../../support/exceptions';
import { dbAdapter } from '../../models';


export function postAccessRequired(map = { postId: 'post' }) {
  return async (ctx, next) => {
    const forbidden = (reason = 'You can not see this post') => new ForbiddenException(reason);
    const notFound = (reason = 'Post not found') => new NotFoundException(reason);
    const { user: viewer } = ctx.state;

    await Promise.all(Object.keys(map).map(async (key) => {
      if (!ctx.params[key]) {
        throw new ServerErrorException(`Server misconfiguration: the required parameter '${key}' is missing`);
      }

      const { [key]: postId } = ctx.params;
      const post = await dbAdapter.getPostById(postId);
      const author = await dbAdapter.getUserById(post.userId);

      if (!post || !author.isActive) {
        throw notFound();
      }

      const isVisible = await post.isVisibleFor(viewer);

      if (!isVisible) {
        if (!viewer && post.isProtected === '1' && post.isPrivate === '0') {
          throw forbidden('Please sign in to view this post');
        }

        throw forbidden();
      }

      ctx.state[map[key]] = post;
    }));

    await next();
  };
}

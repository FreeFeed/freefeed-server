import {
  ForbiddenException,
  NotFoundException,
  ServerErrorException,
} from '../../support/exceptions';
import { dbAdapter } from '../../models';

export function postAccessRequired() {
  return async (ctx, next) => {
    const forbidden = (reason = 'You can not see this post') => new ForbiddenException(reason);
    const notFound = (reason = 'Post not found') => new NotFoundException(reason);

    const { user: viewer } = ctx.state;
    const { postId } = ctx.params;

    if (!postId) {
      throw new ServerErrorException(
        `Server misconfiguration: the required parameter 'postId' is missing`,
      );
    }

    const post = await dbAdapter.getPostById(postId);
    const author = post ? await dbAdapter.getUserById(post.userId) : null;

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

    ctx.state.post = post;

    await next();
  };
}

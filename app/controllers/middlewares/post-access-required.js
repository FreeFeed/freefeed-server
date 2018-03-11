import _ from 'lodash';
import { ForbiddenException, NotFoundException, ServerErrorException } from '../../support/exceptions';
import { dbAdapter } from '../../models';

export function postAccessRequired(map = { postId: 'post' }) {
  return async (ctx, next) => {
    const forbidden = (reason = 'You cannot see this post') => new ForbiddenException(reason);
    const notFound = (reason = 'Post not found') => new NotFoundException(reason);
    const { user: viewer } = ctx.state;

    await Promise.all(Object.keys(map).map(async (key) => {
      if (!ctx.params[key]) {
        throw new ServerErrorException(`Server misconfiguration: the required parameter '${key}' is missing`);
      }
      const { [key]: postId } = ctx.params;
      const post = await dbAdapter.getPostById(postId);
      if (!post) {
        throw notFound();
      }

      // Viewer CAN NOT see post if:
      // - viwer is anonymous and post is not public or
      // - viewer is authorized and
      //   - post author banned viewer or was banned by viewer or
      //   - post is private and viewer cannot read any of post's destination feeds

      // Check if viewer is anonymous and post is not public
      if (!viewer && post.isProtected === '1') {
        if (post.isPrivate === '0') {
          throw forbidden('Please sign in to view this post');
        } else {
          throw forbidden();
        }
      }

      if (viewer) {
        // Check if post author banned viewer or was banned by viewer
        const bannedUserIds = await dbAdapter.getUsersBansOrWasBannedBy(viewer.id);
        if (bannedUserIds.includes(post.userId)) {
          throw forbidden();
        }

        // Check if post is private and viewer cannot read any of post's destination feeds
        if (post.isPrivate === '1') {
          const privateFeedIds = await dbAdapter.getVisiblePrivateFeedIntIds(viewer.id);
          if (_.isEmpty(_.intersection(post.destinationFeedIds, privateFeedIds))) {
            throw forbidden();
          }
        }
      }

      ctx.state[map[key]] = post;
    }));

    await next();
  };
}

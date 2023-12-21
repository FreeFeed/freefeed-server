import { Middleware } from 'koa';
import { isEqual } from 'lodash';

import { type User, type Post, PubSub as pubSub, dbAdapter } from '../../models';
import { ServerErrorException } from '../../support/exceptions';
import { List } from '../../support/open-lists';

type State = { post?: Post; user?: User };

/**
 * Middleware that checks if user specific properties of the post was changed
 * during the request and emits an RT message if so.
 */
export function postMayUpdateForUser(
  selectUser = (s: State) => Promise.resolve(s.user),
): Middleware<State> {
  return async (ctx, next) => {
    let { post } = ctx.state;
    const user = await selectUser(ctx.state);

    if (!post) {
      throw new ServerErrorException(
        `Server misconfiguration: the required parameter 'postId' is missing`,
      );
    }

    if (!user) {
      return await next();
    }

    const propsBefore = await post.getUserSpecificProps(user);

    const result = await next();

    // Re-read updated post from DB
    post = (await dbAdapter.getPostById(post.id))!;
    const propsAfter = await post.getUserSpecificProps(user);

    if (!isEqual(propsBefore, propsAfter)) {
      // Emit RT message
      await pubSub.updatePost(post.id, { onlyForUsers: List.from([user.id]) });
    }

    return result;
  };
}

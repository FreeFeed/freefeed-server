import type { Next } from 'koa';

import type { User } from '../../models';
import { dbAdapter } from '../../models';
import {
  ForbiddenException,
  NotFoundException,
  ServerErrorException,
} from '../../support/exceptions';
import type { Ctx } from '../../support/types';
import type { Article } from '../../models/article';

export function articleAccessRequired(acceptShortId = false) {
  return async (ctx: Ctx<{ user: User; article?: Article }>, next: Next) => {
    const forbidden = (reason = 'You can not see this article') => new ForbiddenException(reason);
    const notFound = (reason = 'Article not found') => new NotFoundException(reason);

    const { user: viewer } = ctx.state;
    let { articleId } = ctx.params;

    if (acceptShortId && articleId && articleId.length < 36) {
      articleId = await dbAdapter.getArticleLongId(articleId);

      if (!articleId) {
        throw notFound();
      }
    }

    if (!articleId) {
      throw new ServerErrorException(
        `Server misconfiguration: the required parameter 'articleId' is missing`,
      );
    }

    const article = await dbAdapter.getArticleById(articleId);

    if (!article) {
      throw notFound();
    }

    switch (await article.isVisibleFor(viewer)) {
      case 'VISIBLE':
        break;
      case 'DENIED':
        throw forbidden();
      case 'LOGIN_REQUIRED':
        throw forbidden('Please sign in to view this article');
      case 'NOT_FOUND':
        throw notFound();
    }

    ctx.state.article = article;

    await next();
  };
}

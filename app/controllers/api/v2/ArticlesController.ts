import compose from 'koa-compose';
import type { z } from 'zod';
import { compact } from 'lodash-es';

import { authRequired, inputSchemaRequired, monitored } from '../../middlewares';
import { dbAdapter } from '../../../models';
import type { User } from '../../../models';
import type { Ctx } from '../../../support/types';
import { serializeArticleFull } from '../../../serializers/v2/articles';
import { serializeUsersByIds } from '../../../serializers/v2/user';
import { serializeAttachment } from '../../../serializers/v2/attachment';
import { articleAccessRequired } from '../../middlewares/article-access-required';
import type { Article } from '../../../models/article';
import { serializeFeed } from '../../../serializers/v2/post';

import { createArticleSchema } from './data-schemes/articles';

export const create = compose([
  authRequired(),
  inputSchemaRequired(createArticleSchema),
  monitored('articles.create'),
  async (ctx: Ctx<{ user: User; article: Article; apiVersion: number }>) => {
    const { user, apiVersion } = ctx.state;
    const body = ctx.request.body as z.infer<typeof createArticleSchema>;
    const article = await dbAdapter.createArticle({
      author_id: user.id,
      title: body.title,
      digest: body.digest,
      body: body.body,
    });

    ctx.body = await fullArticleResponse(user, article, apiVersion);
  },
]);

export const getById = compose([
  articleAccessRequired(true),
  monitored('articles.getById'),
  async (ctx: Ctx<{ user: User; article: Article; apiVersion: number }>) => {
    const { user, article, apiVersion } = ctx.state;
    ctx.body = await fullArticleResponse(user, article, apiVersion);
  },
]);

async function fullArticleResponse(viewer: User, article: Article, apiVersion: number) {
  const feedOutput = await serializeFeed(article.postId ? [article.postId] : [], viewer?.id);
  const { timelines: _timelines, isLastPage: _isLastPage, ...output } = feedOutput;

  const serArticle = await serializeArticleFull(article);
  const serUsers = await serializeUsersByIds([article.authorId], viewer?.id);
  const attachments = compact(await dbAdapter.getAttachmentsByIds(serArticle.attachmentIds));
  const serAttachments = attachments.map((a) => serializeAttachment(a, apiVersion));

  return {
    ...output,
    article: serArticle,
    attachments: mergeByIds(serAttachments, output.attachments),
    users: mergeByIds(serUsers, output.users),
  };
}

function mergeByIds<T extends { id: string }>(arr1: T[], arr2: T[]): T[] {
  const map = new Map<string, T>();

  for (const item of arr1) {
    map.set(item.id, item);
  }

  for (const item of arr2) {
    map.set(item.id, item);
  }

  return Array.from(map.values());
}

import compose from 'koa-compose';
import { z } from 'zod';
import { compact } from 'lodash-es';

import { authRequired, inputSchemaRequired, monitored } from '../../middlewares';
import { dbAdapter, PubSub } from '../../../models';
import type { User } from '../../../models';
import type { Ctx, UUID } from '../../../support/types';
import {
  serializeArticleFull,
  serializeArticle,
  serializeArticleRevision,
  serializeArticleRevisionFull,
} from '../../../serializers/v2/articles';
import { serializeUsersByIds } from '../../../serializers/v2/user';
import { articleAccessRequired } from '../../middlewares/article-access-required';
import type { Article } from '../../../models/article';
import { serializeFeed } from '../../../serializers/v2/post';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServerErrorException,
} from '../../../support/exceptions';
import { UndoArticleDelete } from '../../../support/undo/article-delete';
import { getQueryParams } from '../admin/query-params';

import { createArticleSchema } from './data-schemes/articles';

export const create = compose([
  authRequired(),
  inputSchemaRequired(createArticleSchema),
  monitored('articles.create'),
  async (ctx: Ctx<{ user: User; article: Article; apiVersion: number }>) => {
    const { user } = ctx.state;
    const body = ctx.request.body as z.infer<typeof createArticleSchema>;
    const article = await dbAdapter.createArticle({
      author_id: user.id,
      digest: body.digest,
      body: body.body,
    });

    if (body.tags.length) {
      await article.setTags(body.tags);
    }

    await PubSub.newArticle(article.id);

    ctx.body = await fullArticleResponse(user, article);
  },
]);

export const list = compose([
  monitored('articles.list'),
  async (ctx: Ctx<{ user: User | null; apiVersion: number }>) => {
    const { user, apiVersion } = ctx.state;
    const authorName = queryParam(ctx.request.query.author);
    const publishedParam = queryParam(ctx.request.query.published);

    if (authorName === '') {
      throw new BadRequestException('Invalid author');
    }

    if (publishedParam !== undefined && publishedParam !== 'true' && publishedParam !== 'false') {
      throw new BadRequestException('Invalid published value');
    }

    const author = authorName ? await dbAdapter.getFeedOwnerByUsername(authorName) : null;

    if (authorName && (!author || !author.isUser())) {
      throw new BadRequestException('Invalid author');
    }

    const { limit, offset } = getQueryParams(ctx.request.query);
    const articleIds = await dbAdapter.getVisibleArticleIds(user?.id ?? null, {
      authorId: author?.id ?? null,
      published: publishedParam === 'true',
      limit: limit + 1,
      offset,
    });
    const isLastPage = articleIds.length <= limit;

    if (!isLastPage) {
      articleIds.length = limit;
    }

    const articlesById = await dbAdapter.getArticleSummariesByIds(articleIds);
    const articles = compact(articleIds.map((id) => articlesById.get(id)));
    const postIds = [
      ...new Set(articles.map((article) => article.postId).filter((id): id is UUID => id !== null)),
    ];
    const feedOutput = await serializeFeed(postIds, user?.id ?? null, null, {
      isLastPage,
      apiVersion,
    });
    const { timelines: _timelines, articles: _feedArticles, ...sidecars } = feedOutput;
    const articleAuthors = await serializeUsersByIds(
      [...new Set(articles.map((article) => article.authorId))],
      user?.id ?? null,
    );

    ctx.body = {
      ...sidecars,
      articles: articles.map(serializeArticle),
      users: mergeByIds(articleAuthors, sidecars.users),
      isLastPage,
    };
  },
]);

export const getById = compose([
  articleAccessRequired(true),
  monitored('articles.getById'),
  async (ctx: Ctx<{ user: User; article: Article; apiVersion: number }>) => {
    const { user, article } = ctx.state;
    ctx.body = await fullArticleResponse(user, article);
  },
]);

export const getRevisions = compose([
  authRequired(),
  articleAccessRequired(true),
  monitored('articles.getRevisions'),
  async (ctx: Ctx<{ user: User; article: Article }>) => {
    const { user, article } = ctx.state;

    if (article.authorId !== user.id) {
      throw new ForbiddenException('You are not allowed to view article revisions');
    }

    const { limit, offset } = getQueryParams(ctx.request.query);
    const revisions = await article.getRevisions(limit + 1, offset);
    const isLastPage = revisions.length <= limit;

    if (!isLastPage) {
      revisions.length = limit;
    }

    ctx.body = { revisions: revisions.map(serializeArticleRevision), isLastPage };
  },
]);

export const getRevisionById = compose([
  authRequired(),
  articleAccessRequired(true),
  monitored('articles.getRevisionById'),
  async (ctx: Ctx<{ user: User; article: Article; apiVersion: number }>) => {
    const { user, article } = ctx.state;

    if (article.authorId !== user.id) {
      throw new ForbiddenException('You are not allowed to view article revisions');
    }

    const revisionId = z.uuid().safeParse(ctx.params.revisionId);

    if (!revisionId.success) {
      throw new NotFoundException('Article revision not found');
    }

    const revision = await dbAdapter.getArticleRevisionById(revisionId.data);

    if (!revision || revision.articleId !== article.id) {
      throw new NotFoundException('Article revision not found');
    }

    ctx.body = { revision: serializeArticleRevisionFull(revision) };
  },
]);

export const update = compose([
  authRequired(),
  articleAccessRequired(true),
  inputSchemaRequired(createArticleSchema),
  monitored('articles.update'),
  async (ctx: Ctx<{ user: User; article: Article; apiVersion: number }>) => {
    const { user, article } = ctx.state;
    const { expectedVersion: expectedVersionParam } = ctx.request.query;

    if (article.authorId !== user?.id) {
      throw new ForbiddenException('You are not allowed to update this article');
    }

    if (typeof expectedVersionParam !== 'string' || !/^[1-9]\d*$/.test(expectedVersionParam)) {
      throw new BadRequestException('Invalid expected version');
    }

    const expectedVersion = Number(expectedVersionParam);

    if (!Number.isSafeInteger(expectedVersion)) {
      throw new BadRequestException('Invalid expected version');
    }

    const body = ctx.request.body as z.infer<typeof createArticleSchema>;
    const result = await article.update(
      expectedVersion,
      {
        digest: body.digest,
        body: body.body,
      },
      body.tags,
    );

    switch (result.status) {
      case 'updated':
      case 'unchanged':
        break;
      case 'conflict':
        throw new ConflictException('Article version is mismatched');
      case 'not-found':
        throw new NotFoundException('Article not found');
      default:
        throw new ServerErrorException('Unknown update result');
    }

    ctx.body = await fullArticleResponse(user, article);
  },
]);

export const deactivate = compose([
  authRequired(),
  articleAccessRequired(true),
  monitored('articles.delete'),
  async (ctx: Ctx<{ user: User; article: Article; apiVersion: number }>) => {
    const { user, article } = ctx.state;

    if (article.authorId !== user?.id) {
      throw new ForbiddenException('You are not allowed to delete this article');
    }

    const undo = [];

    if (await article.deactivate()) {
      undo.push(
        new UndoArticleDelete(article.id).serialize(user.id, 'You deleted your article', {}),
      );
    }

    ctx.body = { undo };
  },
]);

export const detachPost = compose([
  authRequired(),
  articleAccessRequired(true),
  monitored('articles.detachPost'),
  async (ctx: Ctx<{ user: User; article: Article; apiVersion: number }>) => {
    const { user, article } = ctx.state;

    if (article.authorId !== user.id) {
      throw new ForbiddenException('You are not allowed to detach this article from its post');
    }

    await article.setPost(null);
    ctx.body = await fullArticleResponse(user, article);
  },
]);

export async function fullArticleResponse(viewer: User, article: Article) {
  const feedOutput = await serializeFeed(article.postId ? [article.postId] : [], viewer?.id);
  const { timelines: _timelines, isLastPage: _isLastPage, ...output } = feedOutput;

  const serArticle = await serializeArticleFull(article);
  const serUsers = await serializeUsersByIds([article.authorId], viewer?.id);

  return {
    ...output,
    article: serArticle,
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

function queryParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[value.length - 1] : value;
}

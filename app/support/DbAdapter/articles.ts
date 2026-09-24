import { isDeepStrictEqual } from 'node:util';

import { sql } from 'slonik';
import type { CommonQueryMethods } from 'slonik';
import { z } from 'zod';
import { fromError } from 'zod-validation-error';
import { pick } from 'lodash-es';

import { Article, ARTICLE_CONTENT_KEYS, ArticleRevision } from '../../models/article';
import type {
  ArticleCreationParams,
  ArticleDbRowContent,
  ArticleUpdateResult,
} from '../../models/article';
import type { UUID } from '../types';
import { currentConfig } from '../app-async-context';
import { ValidationException } from '../exceptions';
import { articleBodySchema, extractAttachmentIds } from '../../models/article-body';

import { createShortId } from './short-ids';

import type { DbAdapter } from './index';

///////////////////////////////////////////////////
// Articles
///////////////////////////////////////////////////

const articlesTrait = (superClass: typeof DbAdapter) =>
  class extends superClass {
    async getArticleById(uid: UUID): Promise<Article | null> {
      const pool = await this.getSlonik();
      const row = await pool.maybeOne(articleQuery`select * from articles where uid = ${uid}`);
      return row ? new Article(this, row) : null;
    }

    async getArticleRevisionById(uid: UUID): Promise<ArticleRevision | null> {
      const pool = await this.getSlonik();
      const row = await pool.maybeOne(
        articleRevisionQuery`select * from article_revisions where uid = ${uid}`,
      );
      return row ? new ArticleRevision(this, row) : null;
    }

    async getArticleRevisions(
      articleId: UUID,
      limit: number,
      offset: number,
      descOrder = true,
    ): Promise<ArticleRevision[]> {
      const pool = await this.getSlonik();
      const order = descOrder ? sql.fragment`desc` : sql.fragment`asc`;
      const rows = await pool.any(
        articleRevisionQuery`select * from article_revisions where
          article_id = ${articleId} order by version ${order}
          limit ${limit} offset ${offset}`,
      );
      return rows.map((row) => new ArticleRevision(this, row));
    }

    async createArticle(params: ArticleCreationParams): Promise<Article> {
      const bodyResult = articleBodySchema.safeParse(params.body);

      if (!bodyResult.success) {
        throw new ValidationException(fromError(bodyResult.error).message);
      }

      const pool = await this.getSlonik();
      const { createdId, attachmentIds } = await pool.transaction(async (trx) => {
        const id = await trx.oneFirst(
          uidQuery`insert into articles
          (author_id, title, digest, body)
          values
          (${params.author_id}, ${params.title}, ${params.digest},
            ${sql.jsonb(params.body)})
          returning uid`,
        );

        // Extract attachment IDs from the article body
        const linkedAttachmentIds = await this.checkArticleAttachments(
          trx,
          id,
          params.author_id,
          extractAttachmentIds(params.body),
        );

        if (linkedAttachmentIds.length > 0) {
          await trx.query(
            voidQuery`update attachments set article_id = ${id}
                    where uid = any(${sql.array(linkedAttachmentIds, 'uuid')})`,
          );
        }

        // Create a short ID for the article
        await createShortId(currentConfig().shortLinks.initialLength.article, (shortId) =>
          trx
            .maybeOneFirst(
              shortIdQuery`insert into article_short_ids (short_id, long_id) values (${shortId}, ${id})
              on conflict (short_id) do nothing returning short_id`,
            )
            .then((res) => !!res),
        );

        return { createdId: id, attachmentIds: linkedAttachmentIds };
      });

      await Promise.all(attachmentIds.map((id) => this.dropCachedAttachmentData(id)));

      const article = await this.getArticleById(createdId);

      if (!article) {
        // We should never reach this point if the article was successfully created
        throw new Error(`Failed to create article with id ${createdId}`);
      }

      return article;
    }

    async getArticleLongId(shortId: string): Promise<UUID | null> {
      const pool = await this.getSlonik();
      return pool.maybeOneFirst(
        uidQuery`select long_id as uid from article_short_ids where short_id = ${shortId}`,
      );
    }

    async getArticleByShortId(shortId: string): Promise<Article | null> {
      const pool = await this.getSlonik();
      const row = await pool.maybeOne(
        articleQuery`select a.* from articles a
          join article_short_ids s on s.long_id = a.uid
          where s.short_id = ${shortId}`,
      );
      return row ? new Article(this, row) : null;
    }

    async getArticleShortId(articleId: UUID): Promise<string> {
      const pool = await this.getSlonik();
      return pool.oneFirst(
        shortIdQuery`select short_id from article_short_ids where long_id = ${articleId}`,
      );
    }

    async getArticleTags(articleId: UUID): Promise<readonly string[]> {
      const pool = await this.getSlonik();
      return pool.anyFirst(
        tagQuery`select t.name
          from article_tags at
          join hashtags t on t.id = at.tag_id
          where at.article_id = ${articleId}
          order by at.ord`,
      );
    }

    async setArticleTags(articleId: UUID, tags: string[]): Promise<void> {
      const pool = await this.getSlonik();
      const normalizedTags = [...new Set(tags.map((tag) => tag.toLowerCase()))];
      await this.getOrCreateHashtagIdsByNames(normalizedTags);
      const tagIds = (
        await pool.any(
          hashtagIdQuery`select h.id
            from unnest(${sql.array(normalizedTags, 'text')}) with ordinality as t(name, ord)
            join hashtags h on h.name = t.name
            order by t.ord`,
        )
      ).map(({ id }) => id);

      await pool.transaction(async (trx) => {
        await trx.oneFirst(
          uidQuery`select uid from articles where uid = ${articleId} for no key update`,
        );

        // Delete existing tags and hashtag usages for the article before inserting the new ones
        await trx.query(voidQuery`delete from article_tags where article_id = ${articleId}`);
        await trx.query(
          voidQuery`delete from hashtag_usages where entity_id = ${articleId} and type = ${'article'}`,
        );

        // Insert new tags and hashtag usages for the article
        await trx.query(
          voidQuery`insert into article_tags (article_id, tag_id, ord)
            select ${articleId}, tag_id, ord
            from unnest(${sql.array(tagIds, 'int4')}) with ordinality as t(tag_id, ord)`,
        );
        await trx.query(
          voidQuery`insert into hashtag_usages (entity_id, hashtag_id, type)
            select ${articleId}, tag_id, ${'article'}
            from unnest(${sql.array(tagIds, 'int4')}) as t(tag_id)`,
        );
      });
    }

    async getArticleAttachmentIds(articleId: UUID): Promise<UUID[]> {
      const pool = await this.getSlonik();
      const ids = await pool.anyFirst(
        uidQuery`select uid from attachments where article_id = ${articleId} order by uid`,
      );
      return [...ids];
    }

    private async checkArticleAttachments(
      trx: CommonQueryMethods,
      articleId: UUID,
      authorId: UUID,
      attachmentIds: UUID[],
    ): Promise<UUID[]> {
      const uniqueAttachmentIds = [...new Set(attachmentIds)];

      if (uniqueAttachmentIds.length === 0) {
        return [];
      }

      const attachments = await trx.any(
        uidQuery`select uid from attachments where
          uid = any(${sql.array(uniqueAttachmentIds, 'uuid')})
          and user_id = ${authorId}
          and (article_id is null or article_id = ${articleId})
          and post_id is null
          order by uid for update`,
      );

      if (attachments.length !== uniqueAttachmentIds.length) {
        throw new ValidationException('Some article attachments are unavailable');
      }

      return uniqueAttachmentIds;
    }

    async updateArticle(
      uid: UUID,
      expectedVersion: number,
      params: ArticleDbRowContent,
    ): Promise<ArticleUpdateResult> {
      const pool = await this.getSlonik();
      const updatedAttachmentIds: UUID[] = [];
      const result = await pool.transaction(async (trx): Promise<ArticleUpdateResult> => {
        const currentData = await trx.maybeOne(
          articleQuery`select * from articles where uid = ${uid} for update`,
        );

        if (currentData === null) {
          return { status: 'not-found' };
        }

        if (currentData.version !== expectedVersion) {
          return { status: 'conflict' };
        }

        const currentContent = pick(currentData, ...ARTICLE_CONTENT_KEYS);
        const newContent = pick(params, ...ARTICLE_CONTENT_KEYS);

        if (isDeepStrictEqual(currentContent, newContent)) {
          return { status: 'unchanged' };
        }

        const bodyResult = articleBodySchema.safeParse(params.body);

        if (!bodyResult.success) {
          throw new ValidationException(fromError(bodyResult.error).message);
        }

        const newAttachmentIds = await this.checkArticleAttachments(
          trx,
          currentData.uid,
          currentData.author_id,
          extractAttachmentIds(params.body),
        );

        await trx.oneFirst(
          uidQuery`insert into article_revisions
            (article_id, title, digest, body, version)
            select 
            uid, title, digest, body, version from articles
            where articles.uid = ${uid} returning uid`,
        );

        const version = await trx.oneFirst(
          versionQuery`update articles
            set title = ${params.title},
                digest = ${params.digest},
                body = ${sql.jsonb(params.body)},
                version = version + 1,
                updated_at = now()
            where uid = ${uid} and version = ${expectedVersion}
            returning version`,
        );

        const prevAttachmentIds = extractAttachmentIds(currentData.body);

        const addedAttachmentIds = newAttachmentIds.filter((id) => !prevAttachmentIds.includes(id));
        const removedAttachmentIds = prevAttachmentIds.filter(
          (id) => !newAttachmentIds.includes(id),
        );

        if (addedAttachmentIds.length > 0) {
          await trx.query(
            voidQuery`update attachments set article_id = ${currentData.uid}
              where uid = any(${sql.array(addedAttachmentIds, 'uuid')})`,
          );
          updatedAttachmentIds.push(...addedAttachmentIds);
        }

        if (removedAttachmentIds.length > 0) {
          await trx.query(
            voidQuery`update attachments set article_id = null
              where uid = any(${sql.array(removedAttachmentIds, 'uuid')})
              and article_id = ${currentData.uid}`,
          );
          updatedAttachmentIds.push(...removedAttachmentIds);
        }

        return { status: 'updated', version };
      });

      await Promise.all(updatedAttachmentIds.map((id) => this.dropCachedAttachmentData(id)));

      return result;
    }

    /**
     * Associates or disassociates a post with an article.
     *
     * @param uid The unique identifier of the article.
     * @param postId The unique identifier of the post to associate with the article, or null
     * to disassociate it. Post (if specified) must have been created by the same author as the article.
     */
    async setArticlePost(uid: UUID, postId: UUID | null): Promise<boolean> {
      const pool = await this.getSlonik();
      const result = await pool.maybeOneFirst(
        uidQuery`update articles
          set post_id = ${postId}
          where articles.uid = ${uid}
            and (
              ${postId}::uuid is null
              or exists (
                select 1 from posts
                where posts.uid = ${postId}
                  and posts.user_id = articles.author_id
              )
            )
          returning uid`,
      );
      return result !== null;
    }

    async deactivateArticle(uid: UUID): Promise<boolean> {
      const pool = await this.getSlonik();
      const result = await pool.maybeOneFirst(
        uidQuery`update articles set to_delete = true where
          uid = ${uid} and not to_delete returning uid`,
      );
      return result !== null;
    }

    async activateArticle(uid: UUID): Promise<boolean> {
      const pool = await this.getSlonik();
      const result = await pool.maybeOneFirst(
        uidQuery`update articles set to_delete = false where
          uid = ${uid} and to_delete returning uid`,
      );
      return result !== null;
    }

    async destroyArticle(uid: UUID): Promise<boolean> {
      const pool = await this.getSlonik();
      const attachmentIds = await pool.transaction(async (trx) => {
        const articleId = await trx.maybeOneFirst(
          uidQuery`select uid from articles where uid = ${uid} for update`,
        );

        if (articleId === null) {
          return null;
        }

        const linkedAttachmentIds = await trx.anyFirst(
          uidQuery`select uid from attachments where article_id = ${uid}`,
        );

        await trx.query(
          voidQuery`delete from hashtag_usages where entity_id = ${uid} and type = ${'article'}`,
        );
        await trx.query(voidQuery`delete from articles where uid = ${uid}`);
        return linkedAttachmentIds;
      });

      if (attachmentIds === null) {
        return false;
      }

      await Promise.all(attachmentIds.map((id) => this.dropCachedAttachmentData(id)));
      return true;
    }
  };

export default articlesTrait;

const uidQuery = sql.type(z.object({ uid: z.uuid() }));
const tagQuery = sql.type(z.object({ name: z.string() }));
const shortIdQuery = sql.type(z.object({ short_id: z.string() }));
const hashtagIdQuery = sql.type(z.object({ id: z.number().int().positive() }));
const voidQuery = sql.type(z.void());

const versionSchema = z.number().int().positive();
const versionQuery = sql.type(z.object({ version: versionSchema }));
const articleContentSchema = {
  title: z.string(),
  digest: z.string(),
  body: articleBodySchema,
};
const articleQuery = sql.type(
  z.object({
    uid: z.uuid(),
    author_id: z.uuid(),
    post_id: z.uuid().nullable(),
    created_at: z.date(),
    updated_at: z.date(),
    version: versionSchema,
    to_delete: z.boolean(),
    ...articleContentSchema,
  }),
);
const articleRevisionQuery = sql.type(
  z.object({
    uid: z.uuid(),
    article_id: z.uuid(),
    created_at: z.date(),
    version: versionSchema,
    ...articleContentSchema,
  }),
);

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

import { createArticleSchema } from './data-schemes/articles';

export const create = compose([
  authRequired(),
  inputSchemaRequired(createArticleSchema),
  monitored('articles.create'),
  async (ctx: Ctx<{ user: User; apiVersion: number }>) => {
    const { user, apiVersion } = ctx.state;
    const body = ctx.request.body as z.infer<typeof createArticleSchema>;
    const article = await dbAdapter.createArticle({
      author_id: user.id,
      title: body.title,
      digest: body.digest,
      body: body.body,
    });

    const serArticle = await serializeArticleFull(article);
    const serUsers = await serializeUsersByIds([user.id], user.id);
    const attachments = compact(await dbAdapter.getAttachmentsByIds(serArticle.attachmentIds));
    const serAttachments = attachments.map((a) => serializeAttachment(a, apiVersion));

    ctx.body = { article: serArticle, attachments: serAttachments, users: serUsers };
  },
]);

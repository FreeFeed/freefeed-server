import { z } from 'zod';

import { articleBodySchema } from '../../../../models/article-body';

export const createArticleSchema = z.object({
  title: z.string().min(1).max(255),
  digest: z.string().max(2000),
  body: articleBodySchema,
  tags: z.array(z.string().min(1).max(50)),
});

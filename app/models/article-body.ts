import { z } from 'zod';

import { UUID } from '../support/types';

const articleBlockSchema = z
  .object({
    // All blocks must have an ID
    id: z.string(),
  })
  .and(
    // Discriminated union for different block types
    z.discriminatedUnion('type', [
      z.object({ type: z.literal('text'), content: z.string() }),
      z.object({
        type: z.literal('list'),
        items: z.array(z.string()),
      }),
      z.object({
        type: z.literal('code'),
        language: z.string().optional(),
        content: z.string(),
      }),
      z.object({
        type: z.literal('media'),
        attachmentId: z.uuid(),
        alt: z.string().optional(),
        caption: z.string().optional(),
      }),
      z.object({
        type: z.literal('gallery'),
        items: z.array(
          z.object({
            attachmentId: z.uuid(),
            alt: z.string().optional(),
            caption: z.string().optional(),
          }),
        ),
      }),
      // ...other block types can be added here
    ]),
  );

export const articleBodySchema = z.object({
  blocks: z.array(articleBlockSchema),
});

export type ArticleBody = z.infer<typeof articleBodySchema>;

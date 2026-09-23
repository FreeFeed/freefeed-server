import { z } from 'zod';

import type { UUID } from '../support/types';

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
  blocks: z
    .array(articleBlockSchema)
    .refine((blocks) => new Set(blocks.map(({ id }) => id)).size === blocks.length, {
      message: 'Block IDs must be unique',
    }),
});

export type ArticleBody = z.infer<typeof articleBodySchema>;

/**
 * Extracts all attachment IDs from the given article body
 *
 * @param body The article body from which to extract attachment IDs.
 * @returns An array of unique (!) attachment IDs found in the article body.
 */
export function extractAttachmentIds(body: ArticleBody): UUID[] {
  const ids = new Set<UUID>();

  for (const block of body.blocks) {
    if (block.type === 'media') {
      ids.add(block.attachmentId);
    } else if (block.type === 'gallery') {
      for (const item of block.items) {
        ids.add(item.attachmentId);
      }
    }
  }

  return Array.from(ids);
}

import { fromMarkdown } from 'mdast-util-from-markdown';
import { z } from 'zod';

import { extractMentions as extractMentionsFromText } from '../support/mentions';

export const articleBodySchema = z.string();

export type ArticleBody = z.infer<typeof articleBodySchema>;

const TITLE_MAX_LENGTH = 255;

export function extractTitle(body: ArticleBody): string {
  const root = fromMarkdown(body);
  const heading = root.children.find((node) => node.type === 'heading' && node.depth === 1);
  return (heading ? nodeText(heading) : body).slice(0, TITLE_MAX_LENGTH);
}

export function extractMentions(body: ArticleBody): string[] {
  const mentions = new Set<string>();

  visitText(fromMarkdown(body), (text) => {
    for (const mention of extractMentionsFromText(text)) {
      mentions.add(mention);
    }
  });

  return [...mentions];
}

function nodeText(node: unknown): string {
  if (!node || typeof node !== 'object') {
    return '';
  }

  if ('value' in node && typeof node.value === 'string') {
    return node.value;
  }

  if ('alt' in node && typeof node.alt === 'string') {
    return node.alt;
  }

  if ('children' in node && Array.isArray(node.children)) {
    return node.children.map(nodeText).join('');
  }

  return '';
}

function visitText(node: unknown, visitor: (text: string) => void): void {
  if (!node || typeof node !== 'object') {
    return;
  }

  if ('type' in node && node.type === 'text' && 'value' in node && typeof node.value === 'string') {
    visitor(node.value);
  }

  if ('children' in node && Array.isArray(node.children)) {
    node.children.forEach((child) => visitText(child, visitor));
  }
}

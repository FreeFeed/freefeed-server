import { emails, mentions, links, arrows, hashtags, withTexts } from 'social-text-tokenizer';
import { reTokenizer, makeToken } from 'social-text-tokenizer/utils';

import { uuidRe } from './backlinks';

export const UUID_TOKEN = 'UUID';
export const HTML_TAG_TOKEN = 'HTML_TAG';

export function htmlTagContent(text: string): string {
  return text.replace(/<\/?(.+?)>/g, '$1').trim();
}

export function isHtmlTagClosing(text: string): boolean {
  return /<\//.test(text);
}

const htmlTags = reTokenizer(/<\/?.+?>/g, makeToken(HTML_TAG_TOKEN));
const uuidStrings = reTokenizer(uuidRe, makeToken(UUID_TOKEN));

export const tokenize = withTexts(
  hashtags(),
  emails(),
  mentions(),
  links({ tldList: ['рф', 'com', 'net', 'org', 'edu', 'place'] }),
  arrows(),
  htmlTags,
  uuidStrings,
);

import { emails, mentions, links, arrows, hashtags, withTexts } from 'social-text-tokenizer';
import { reTokenizer, makeToken, wordAdjacentChars } from 'social-text-tokenizer/utils';
import { withCharsAfter, withCharsBefore, withFilters } from 'social-text-tokenizer/filters';

const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

export const UUID_TOKEN = 'UUID';
export const HTML_TAG_TOKEN = 'HTML_TAG';
export const REDDIT_LINK = 'REDDIT_LINK';
export const SHORT_LINK = 'SHORT_LINK';

export function htmlTagContent(text: string): string {
  return text.replace(/<\/?(.+?)>/g, '$1').trim();
}

export function isHtmlTagClosing(text: string): boolean {
  return /<\//.test(text);
}

const htmlTags = reTokenizer(/<\/?.+?>/g, makeToken(HTML_TAG_TOKEN));
const uuidStrings = reTokenizer(uuidRe, makeToken(UUID_TOKEN));

const redditLinks = withFilters(
  reTokenizer(/\/?r\/[A-Za-z\d]\w{1,20}/g, makeToken(REDDIT_LINK)),
  withCharsBefore(wordAdjacentChars.withoutChars('/')),
  withCharsAfter(wordAdjacentChars.withoutChars('/')),
);

const shortLinkRe = /\/[a-z\d-]{3,35}\/[\da-f]{6,10}(?:#[\da-f]{4,6})?/gi;

const shortLinks = withFilters(
  reTokenizer(shortLinkRe, makeToken(SHORT_LINK)),
  withCharsBefore(wordAdjacentChars.withoutChars('/')),
  withCharsAfter(wordAdjacentChars.withoutChars('/')),
);

export const tokenize = withTexts(
  hashtags(),
  emails(),
  mentions(),
  links({ tldList: ['рф', 'com', 'net', 'org', 'edu', 'place'] }),
  arrows(),
  htmlTags,
  uuidStrings,
  shortLinks,
  redditLinks,
);

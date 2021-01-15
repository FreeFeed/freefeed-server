import {
  withText,
  combine,
  hashTags,
  emails,
  mentions,
  links,
  arrows,
  Token,
} from 'social-text-tokenizer';
// The CJS version of social-text-tokenizer has not .d.ts yet, so expecting error
// @ts-expect-error
import byRegexp from 'social-text-tokenizer/build/cjs/lib/byRegexp';

export class HTMLTag extends Token {
  public closing = false;
  public content = '';
}

const htmlTags = byRegexp(/<(\/)?(.+?)>/g, (offset: number, text: string, m: RegExpExecArray) => {
  const t = new HTMLTag(offset, text);
  t.closing = !!m[1];
  t.content = m[2].trim();
  return t;
});

export const tokenize = withText(
  combine(
    hashTags(),
    emails(),
    mentions(),
    links({ tldList: ['рф', 'com', 'net', 'org', 'edu', 'place'] }),
    arrows(),
    htmlTags,
  ),
);

import { withText, combine, hashTags, emails, mentions, links, arrows } from 'social-text-tokenizer';


export const tokenize = withText(combine(
  hashTags(),
  emails(),
  mentions(),
  links({ tldList: ['рф', 'com', 'net', 'org', 'edu', 'place'] }),
  arrows(),
));

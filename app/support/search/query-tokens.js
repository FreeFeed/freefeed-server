import XRegExp from 'xregexp';
import pgFormat from 'pg-format';
import { Link, HashTag, Mention } from 'social-text-tokenizer';

import { tokenize } from '../tokenize-text';

import { linkToText } from './norm';


export const IN_POSTS = 1,
  IN_COMMENTS = 2,
  IN_ALL = IN_POSTS | IN_COMMENTS;

export class Pipe {}

export class ScopeStart {
  scope = 0;

  constructor(scope) {
    this.scope = scope;
  }

  getComplexity() {
    return 0;
  }
}

export class Condition {
  exclude = false;
  condition = '';
  args = [];

  constructor(exclude, condition, args) {
    this.exclude = exclude;
    this.condition = condition;
    this.args = args;
  }

  getComplexity() {
    return 0.5 * this.args.length;
  }
}

export class Text {
  exclude = false;
  phrase = false;
  text = '';

  constructor(exclude, phrase, text) {
    this.exclude = exclude;
    this.phrase = phrase;
    this.text = text;
  }

  getComplexity() {
    return this.phrase ? this.text.split(/\s+/).length : 1;
  }

  toTSQuery() {
    const prefix = this.exclude ? '!!' : '';

    if (this.phrase) {
      const queries = tokenize(this.text).map((token) => {
        if (token instanceof HashTag || token instanceof Mention) {
          return pgFormat(`%L::tsquery`, token.text);
        } else if (token instanceof Link) {
          return pgFormat('phraseto_tsquery(%L)', linkToText(token));
        }

        return pgFormat('phraseto_tsquery(%L)', token.text);
      });
      return `${prefix}(${queries.join('<->')})`;
    } else if (/^[#@]/.test(this.text)) {
      return prefix + pgFormat(`%L::tsquery`, this.text);
    }

    const [firstToken] = tokenize(this.text);

    if (firstToken instanceof Link) {
      return prefix + pgFormat('phraseto_tsquery(%L)', linkToText(firstToken));
    }

    return prefix + pgFormat(`plainto_tsquery(%L)`, this.text);
  }
}

export class AnyText {
  texts = [];

  constructor(texts) {
    this.texts = texts;
  }

  getComplexity() {
    return this.texts.reduce((acc, t) => acc + t.getComplexity(), 0);
  }

  toTSQuery() {
    return `(${this.texts.map((t) => t.toTSQuery()).join(' || ')})`;
  }
}

export class InScope {
  scope = 0;
  anyTexts = [];

  constructor(scope, anyTexts) {
    this.scope = scope;
    this.anyTexts = anyTexts;
  }

  getComplexity() {
    return this.anyTexts.reduce((acc, t) => acc + t.getComplexity(), 0);
  }
}

export const scopeStarts = [
  [/^in-?body$/, IN_POSTS],
  [/^in-?comments?$/, IN_COMMENTS],
];

export const listConditions = [
  // Feeds
  [/^(in|groups?)$/, 'in'],
  [/^in-?my$/, 'in-my'],
  [/^commented-?by$/, 'commented-by'],
  [/^liked-?by$/, 'liked-by'],
  // Comments
  // [/^cliked-?by$/, 'cliked-by'],
  // Authorship
  [/^from$/, 'from'],
  [/^comments?-?from$/, 'comments-from'],
  [/^posts?-?from$/, 'posts-from'],
];

// A simple trimmer, trims punctuation, separators and some symbols.
const trimTextRe = new XRegExp(
  `^[\\pP\\pZ\\pC\\pS]*(.*?)[\\pP\\pZ\\pC\\pS]*$`,
  'u'
);
const trimTextRightRe = new XRegExp(`^(.*?)[\\pP\\pZ\\pC\\pS]*$`, 'u');

export function trimText(text) {
  if (/^[#@]/.test(text)) {
    return text.replace(trimTextRightRe, '$1');
  }

  return text.replace(trimTextRe, '$1');
}

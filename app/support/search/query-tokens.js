import XRegExp from 'xregexp';
import pgFormat from 'pg-format';
import { Link, HashTag, Mention } from 'social-text-tokenizer';
import config from 'config';

import { tokenize } from '../tokenize-text';

import { linkToText } from './norm';


const ftsCfg = config.postgres.textSearchConfigName;

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
          const exactText =
            token instanceof HashTag
              ? token.text.replace(/[_-]/g, '')
              : token.text;
          return pgFormat(`%L::tsquery`, exactText);
        } else if (token instanceof Link) {
          return pgFormat('phraseto_tsquery(%L, %L)', ftsCfg, linkToText(token));
        }

        return pgFormat('phraseto_tsquery(%L, %L)', ftsCfg, token.text);
      });
      return `${prefix}(${queries.join('<->')})`;
    } else if (/^[#@]/.test(this.text)) {
      const exactText =
        this.text.charAt(0) === '#' ? this.text.replace(/[_-]/g, '') : this.text;
      return prefix + pgFormat(`%L::tsquery`, exactText);
    }

    const [firstToken] = tokenize(this.text);

    if (firstToken instanceof Link) {
      return prefix + pgFormat('phraseto_tsquery(%L, %L)', ftsCfg, linkToText(firstToken));
    }

    return prefix + pgFormat(`plainto_tsquery(%L, %L)`, ftsCfg, this.text);
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
    const parts = this.texts.map((t) => t.toTSQuery());
    return parts.length > 1 ? `(${parts.join(' || ')})` : parts.join(' || ');
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
  [/^in-?comments?$/, IN_COMMENTS]
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
  [/^authors?$/, 'author']
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

import XRegExp from 'xregexp';
import pgFormat from 'pg-format';
import { Link, HashTag, Mention } from 'social-text-tokenizer';
import config from 'config';

import { tokenize } from '../tokenize-text';

import { linkToText } from './norm';


const ftsCfg = config.postgres.textSearchConfigName;

export type Scope = 1 | 2 | 3;

export const IN_POSTS = 1 as Scope,
  IN_COMMENTS = 2 as Scope,
  IN_ALL = (IN_POSTS | IN_COMMENTS) as Scope;

export interface Token {
  getComplexity(): number;
}

export class Pipe implements Token {
  getComplexity() {
    return 0;
  }
}

export class ScopeStart implements Token {
  constructor(
    public scope: Scope,
  ) { }

  getComplexity() {
    return 0;
  }
}

export class Condition implements Token {
  constructor(
    public exclude: boolean,
    public condition: string,
    public args: string[],
  ) { }

  getComplexity() {
    return 0.5 * this.args.length;
  }
}

export class Text implements Token {
  constructor(
    public exclude: boolean,
    public phrase: boolean,
    public text: string,
  ) { }

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
      }).filter(Boolean);

      if (queries.length === 0) {
        return "''";
      } else if (queries.length === 1) {
        return `${prefix}${queries[0]}`;
      }

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

export class AnyText implements Token {
  constructor(
    public texts: Text[],
  ) { }

  getComplexity() {
    return this.texts.reduce((acc, t) => acc + t.getComplexity(), 0);
  }

  toTSQuery() {
    const parts = this.texts.map((t) => t.toTSQuery());
    return parts.length > 1 ? `(${parts.join(' || ')})` : parts.join(' || ');
  }
}

export class InScope implements Token {
  constructor(
    public scope: Scope,
    public anyTexts: AnyText[],
  ) { }

  getComplexity() {
    return this.anyTexts.reduce((acc, t) => acc + t.getComplexity(), 0);
  }
}

export const scopeStarts: [RegExp, Scope][] = [
  [/^in-?body$/, IN_POSTS],
  [/^in-?comments?$/, IN_COMMENTS]
];

export const listConditions: [RegExp, string][] = [
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
const trimTextRe = XRegExp(
  `^[\\pP\\pZ\\pC\\pS]*(.*?)[\\pP\\pZ\\pC\\pS]*$`,
  'u'
);
const trimTextRightRe = XRegExp(`^(.*?)[\\pP\\pZ\\pC\\pS]*$`, 'u');

export function trimText(text: string) {
  if (/^[#@]/.test(text)) {
    return text.replace(trimTextRightRe, '$1');
  }

  return text.replace(trimTextRe, '$1');
}

/* eslint babel/semi: "error" */
import { flow } from 'lodash';
import { HashTag } from 'social-text-tokenizer';

import { tokenize } from './tokenize-text';

const FROM_USERNAME_PATTERN = 'from:\\s*(me|[A-Za-z0-9]{3,25})';
const FROM_USERNAME_REPLACEMENT_PATTERN = 'from:\\s*(me|[A-Za-z0-9]{3,})\\s?';
const IN_GROUP_PATTERN = 'group:\\s*([\\-A-Za-z0-9]{3,35})';
const IN_GROUP_REPLACEMENT_PATTERN = 'group:\\s*[\\-A-Za-z0-9]{3,}\\s?';
const QUOTE_PATTERN = '\\"(.+?)\\"';
const QUOTE_REPLACEMENT_PATTERN = '\\".*\\"';

const fromUsernameRegex = new RegExp(FROM_USERNAME_PATTERN, 'i');
const inGroupRegex = new RegExp(IN_GROUP_PATTERN, 'i');
const fromUsernameReplacementRegex = new RegExp(FROM_USERNAME_REPLACEMENT_PATTERN, 'ig');
const inGroupReplacementRegex = new RegExp(IN_GROUP_REPLACEMENT_PATTERN, 'ig');
const quotedQueryReplacementRegex = new RegExp(QUOTE_REPLACEMENT_PATTERN, 'ig');

export class SearchQueryParser {
  static parse(query, defaultUsername = null) {
    query = decodeURIComponent(query);

    const parseResult = {
      query,
      username: '',
      group: '',
      quotes: [],
      hashtags: [],
    };

    this.parseQueryScope(parseResult, defaultUsername);
    this.parseQueryConditions(parseResult);
    this.processQueryText(parseResult);

    return parseResult;
  }

  static parseQueryScope(queryObject, defaultUsername = null) {
    let targetUsername = this.parseTargetUsername(queryObject.query);
    const targetGroupname = this.parseTargetGroupname(queryObject.query);

    if (targetUsername === 'me' && defaultUsername) {
      targetUsername = defaultUsername;
    }

    if (targetUsername) {
      queryObject.username = targetUsername;
    }

    if (targetGroupname) {
      queryObject.group = targetGroupname;
    }
  }

  static processQueryText(queryObject) {
    const removeScopeAndQuotes = flow(
      this.removeQuotes,
      this.removeUserAndGroup,
    );
    queryObject.query = removeScopeAndQuotes(queryObject.query);
    this.extractHashtags(queryObject);
    const transformFullTextQuery = flow(
      this.cleanupQuery,
      this.prepareQuery,
    );
    queryObject.query = transformFullTextQuery(queryObject.query);
  }

  static parseQueryConditions(queryObject) {
    queryObject.quotes = this.parseQuotedQuery(queryObject.query);
  }

  static parseTargetUsername(query) {
    const fromUsernameSubquery = fromUsernameRegex.exec(query);
    return fromUsernameSubquery ? fromUsernameSubquery[1] : null;
  }

  static parseTargetGroupname(query) {
    const inGroupSubquery = inGroupRegex.exec(query);
    return inGroupSubquery ? inGroupSubquery[1] : null;
  }

  static parseQuotedQuery(query) {
    const quotedQueryRegex = new RegExp(QUOTE_PATTERN, 'ig');
    const quotes = [];
    let quote;

    while ((quote = quotedQueryRegex.exec(query)) !== null) {
      quotes.push(quote[1]);
    }

    return quotes;
  }

  static extractHashtags(queryObject) {
    const tokens = tokenize(queryObject.query.toLowerCase());
    const hashtags = [];
    const texts = [];

    for (const token of tokens) {
      if (token instanceof HashTag) {
        hashtags.push(token.text.substr(1));
      } else {
        texts.push(token.text);
      }
    }

    queryObject.query = texts.join('');
    queryObject.hashtags = hashtags;
  }

  static removeQuotes(query) {
    return query.replace(quotedQueryReplacementRegex, '');
  }

  static removeUserAndGroup(query) {
    return query
      .replace(fromUsernameReplacementRegex, '')
      .replace(inGroupReplacementRegex, '')
      .trim();
  }

  static cleanupQuery(query) {
    return query
      .replace(/\s{2,}/gi, ' ')
      .replace(/[^А-Яа-яA-Za-z0-9\-\s]/gi, '')
      .trim();
  }

  static prepareQuery(query) {
    return query.replace(/(^|\s)-/gi, '$1!').replace(/\s+/g, ' & ');
  }
}

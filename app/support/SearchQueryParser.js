import { flow } from 'lodash';
import twitter from 'twitter-text'
import { SEARCH_SCOPES } from './SearchConstants'

const FROM_USERNAME_PATTERN             = 'from:\\s*(me|[A-Za-z0-9]{3,25})';
const FROM_USERNAME_REPLACEMENT_PATTERN = 'from:\\s*(me|[A-Za-z0-9]{3,})\\s?';
const IN_GROUP_PATTERN                  = 'group:\\s*([\\-A-Za-z0-9]{3,35})';
const IN_GROUP_REPLACEMENT_PATTERN      = 'group:\\s*[\\-A-Za-z0-9]{3,}\\s?';
const QUOTE_PATTERN                     = '\\"(.+?)\\"'
const QUOTE_REPLACEMENT_PATTERN         = '\\".*\\"'

const fromUsernameRegex            = new RegExp(FROM_USERNAME_PATTERN, 'i');
const inGroupRegex                 = new RegExp(IN_GROUP_PATTERN, 'i');
const fromUsernameReplacementRegex = new RegExp(FROM_USERNAME_REPLACEMENT_PATTERN, 'ig');
const inGroupReplacementRegex      = new RegExp(IN_GROUP_REPLACEMENT_PATTERN, 'ig');
const quotedQueryReplacementRegex  = new RegExp(QUOTE_REPLACEMENT_PATTERN, 'ig')

export class SearchQueryParser {
  static parse(query, defaultUsername = null) {
    query = decodeURIComponent(query)

    const parseResult = {
      scope:    SEARCH_SCOPES.ALL_VISIBLE_POSTS,
      query,
      username: '',
      group:    '',
      quotes:   [],
      hashtags: []
    }

    this.parseQueryScope(parseResult, defaultUsername)
    this.parseQueryConditions(parseResult)
    this.processQueryText(parseResult)

    return parseResult
  }

  static parseQueryScope(queryObject, defaultUsername = null) {
    let targetUsername  = this.parseTargetUsername(queryObject.query)
    const targetGroupname = this.parseTargetGroupname(queryObject.query)

    if (targetUsername === 'me' && defaultUsername) {
      targetUsername = defaultUsername
    }

    if (targetUsername) {
      queryObject.scope = SEARCH_SCOPES.VISIBLE_USER_POSTS
      queryObject.username = targetUsername
      return
    }
    if (targetGroupname) {
      queryObject.scope = SEARCH_SCOPES.VISIBLE_GROUP_POSTS
      queryObject.group = targetGroupname
    }
  }

  static processQueryText(queryObject) {
    const removeScopeAndQuotes = flow(this.removeQuotes, this.removeUserAndGroup)
    queryObject.query = removeScopeAndQuotes(queryObject.query)
    this.extractHashtags(queryObject)
    const transformFullTextQuery = flow(this.cleanupQuery, this.prepareQuery)
    queryObject.query = transformFullTextQuery(queryObject.query)
  }

  static parseQueryConditions(queryObject) {
    queryObject.quotes = this.parseQuotedQuery(queryObject.query)
  }

  static parseTargetUsername(query) {
    const fromUsernameSubquery = fromUsernameRegex.exec(query)
    return fromUsernameSubquery ? fromUsernameSubquery[1] : null
  }

  static parseTargetGroupname(query) {
    const inGroupSubquery = inGroupRegex.exec(query)
    return inGroupSubquery ? inGroupSubquery[1] : null
  }

  static parseQuotedQuery(query) {
    const quotedQueryRegex = new RegExp(QUOTE_PATTERN, 'ig')
    const quotes = []
    let quote
    while ((quote = quotedQueryRegex.exec(query)) !== null) {
      quotes.push(quote[1])
    }

    return quotes
  }

  static extractHashtags(queryObject) {
    const hashtags = twitter.extractHashtagsWithIndices(queryObject.query.toLowerCase())
    const indices = hashtags.map((h) => h.indices)
    let query = queryObject.query

    const hashtagSubstrings = indices.map(([start, end]) => {
      return query.substring(start, end)
    })

    for (const s of hashtagSubstrings) {
      query = query.replace(s, '')
    }
    queryObject.query = query
    queryObject.hashtags = hashtags.map((h) => h.hashtag)
  }

  static removeQuotes(query) {
    return query.replace(quotedQueryReplacementRegex, '')
  }

  static removeUserAndGroup(query) {
    return query.replace(fromUsernameReplacementRegex, '').replace(inGroupReplacementRegex, '').trim()
  }

  static cleanupQuery(query) {
    return query
      .replace(/\s{2,}/ig, ' ')
      .replace(/[^А-Яа-яA-Za-z0-9\-\s]/ig, '')
      .trim()
  }

  static prepareQuery(query) {
    return query
      .replace(/(^|\s)-/ig, '$1!')
      .replace(/\s+/g, ' & ')
  }
}

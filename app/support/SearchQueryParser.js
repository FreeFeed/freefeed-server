import { flow } from 'lodash';
import { SEARCH_SCOPES, SEARCH_TYPES } from './SearchConstants'

const FROM_USERNAME_PATTERN             = 'from:\\s*([A-Za-z0-9]{3,25})';
const FROM_USERNAME_REPLACEMENT_PATTERN = 'from:\\s*[A-Za-z0-9]{3,}\\s?';
const IN_GROUP_PATTERN                  = 'group:\\s*([\\-A-Za-z0-9]{3,35})';
const IN_GROUP_REPLACEMENT_PATTERN      = 'group:\\s*[\\-A-Za-z0-9]{3,}\\s?';

const fromUsernameRegex            = new RegExp(FROM_USERNAME_PATTERN, 'i');
const inGroupRegex                 = new RegExp(IN_GROUP_PATTERN, 'i');
const fromUsernameReplacementRegex = new RegExp(FROM_USERNAME_REPLACEMENT_PATTERN, 'ig');
const inGroupReplacementRegex      = new RegExp(IN_GROUP_REPLACEMENT_PATTERN, 'ig');

export class SearchQueryParser {
  static parse(query) {
    query = decodeURIComponent(query)

    const parseResult = {
      scope:    SEARCH_SCOPES.ALL_VISIBLE_POSTS,
      query,
      username: '',
      group:    '',
      type:     SEARCH_TYPES.FULL_TEXT
    }

    this.parseQueryScope(parseResult)
    this.parseQueryType(parseResult)
    this.processQueryText(parseResult)

    return parseResult
  }

  static parseQueryScope(queryObject) {
    const targetUsername  = this.parseTargetUsername(queryObject.query)
    const targetGroupname = this.parseTargetGroupname(queryObject.query)

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

  static parseQueryType(queryObject) {
    queryObject.type = SEARCH_TYPES.FULL_TEXT
  }

  static processQueryText(queryObject) {
    if (queryObject.type == SEARCH_TYPES.FULL_TEXT) {
      const transformFullTextQuery = flow(this.removeUserAndGroup, this.cleanupQuery, this.prepareQuery);
      queryObject.query = transformFullTextQuery(queryObject.query);
    }
  }

  static parseTargetUsername(query) {
    const fromUsernameSubquery = fromUsernameRegex.exec(query)
    return fromUsernameSubquery ? fromUsernameSubquery[1] : null
  }

  static parseTargetGroupname(query) {
    const inGroupSubquery = inGroupRegex.exec(query)
    return inGroupSubquery ? inGroupSubquery[1] : null
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
      .replace(/-/ig, '!')
      .replace(/\s/g, ' & ')
  }
}

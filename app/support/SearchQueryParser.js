import { flow } from 'lodash';
import { SEARCH_SCOPES } from './SearchConstants'

const FROM_USERNAME_PATTERN             = '^from:\\s*([A-Za-z0-9]{3,25})';
const FROM_USERNAME_REPLACEMENT_PATTERN = 'from:\\s*[A-Za-z0-9]{3,}\\s?';
const IN_GROUP_PATTERN                  = '^group:\\s*([A-Za-z0-9]{3,25})';
const IN_GROUP_REPLACEMENT_PATTERN      = 'group:\\s*[A-Za-z0-9]{3,}\\s?';

const fromUsernameRegex            = new RegExp(FROM_USERNAME_PATTERN, 'ig');
const inGroupRegex                 = new RegExp(IN_GROUP_PATTERN, 'ig');
const fromUsernameReplacementRegex = new RegExp(FROM_USERNAME_REPLACEMENT_PATTERN, 'ig');
const inGroupReplacementRegex      = new RegExp(IN_GROUP_REPLACEMENT_PATTERN, 'ig');

export class SearchQueryParser {
  static parse(query) {
    query = decodeURIComponent(query)

    const parsedQuery = {
      scope:    SEARCH_SCOPES.ALL_VISIBLE_POSTS,
      query,
      username: '',
      group:    ''
    }

    const targetUsername  = this.parseTargetUsername(query)
    const targetGroupname = this.parseTargetGroupname(query)

    if (targetUsername) {
      parsedQuery.scope = SEARCH_SCOPES.VISIBLE_USER_POSTS
      parsedQuery.username = targetUsername
    } else if (targetGroupname) {
      parsedQuery.scope = SEARCH_SCOPES.VISIBLE_GROUP_POSTS
      parsedQuery.group = targetGroupname
    }

    const transformQuery = flow(this.removeUserAndGroup, this.cleanupQuery, this.prepareQuery);
    parsedQuery.query = transformQuery(query);

    return parsedQuery
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

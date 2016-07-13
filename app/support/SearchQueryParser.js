import { flow } from 'lodash';

export const SEARCH_TYPES = {
  DEFAULT:     'default_search',
  GROUP_POSTS: 'group_posts',
  USER_POSTS:  'user_posts'
}

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
      type:     SEARCH_TYPES.DEFAULT,
      query,
      username: '',
      group:    ''
    }

    const targetUsername  = this.parseTargetUsername(query)
    const targetGroupname = this.parseTargetGroupname(query)

    if (targetUsername) {
      parsedQuery.type = SEARCH_TYPES.USER_POSTS
      parsedQuery.username = targetUsername
    } else if (targetGroupname) {
      parsedQuery.type = SEARCH_TYPES.GROUP_POSTS
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

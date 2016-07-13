export const SEARCH_TYPES = {
  DEFAULT:     'default_search',
  GROUP_POSTS: 'group_posts',
  USER_POSTS:  'user_posts'
}

const FROM_USERNAME_PATTERN             = '^from:\\s*([A-Za-z0-9]{3,25})'
const FROM_USERNAME_REPLACEMENT_PATTERN = 'from:\\s*[A-Za-z0-9]{3,}\\s?'
const IN_GROUP_PATTERN                  = '^group:\\s*([A-Za-z0-9]{3,25})'
const IN_GROUP_REPLACEMENT_PATTERN      = 'group:\\s*[A-Za-z0-9]{3,}\\s?'

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

    parsedQuery.query = this.removeUserAndGroup(query)
    parsedQuery.query = this.cleanupQuery(parsedQuery.query)
    parsedQuery.query = this.prepareQuery(parsedQuery.query)

    return parsedQuery
  }

  static parseTargetUsername(query) {
    const fromUsernameRegex    = new RegExp(FROM_USERNAME_PATTERN, 'ig')
    const fromUsernameSubquery = fromUsernameRegex.exec(query)

    return fromUsernameSubquery ? fromUsernameSubquery[1] : null
  }

  static parseTargetGroupname(query) {
    const inGroupRegex    = new RegExp(IN_GROUP_PATTERN, 'ig')
    const inGroupSubquery = inGroupRegex.exec(query)

    return inGroupSubquery ? inGroupSubquery[1] : null
  }

  static removeUserAndGroup(query) {
    const fromUsernameRegex = new RegExp(FROM_USERNAME_REPLACEMENT_PATTERN, 'ig')
    const inGroupRegex      = new RegExp(IN_GROUP_REPLACEMENT_PATTERN, 'ig')
    return query.replace(fromUsernameRegex, '').replace(inGroupRegex, '').trim()
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

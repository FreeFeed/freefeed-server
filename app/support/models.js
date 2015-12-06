import { isString } from 'lodash'

var sep = ":"

exports.mkKey = function(keys) {
  for (let key of keys) {
    if (!isString(key)) {
      throw new Error('keys should be strings')
    }
  }
  return keys.join(sep)
}



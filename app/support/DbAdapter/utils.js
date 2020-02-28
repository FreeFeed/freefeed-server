import _ from 'lodash';
import pgFormat from 'pg-format';

import { List } from '../open-lists';


export function initObject(classDef, attrs, id, params) {
  return new classDef({ ...attrs, id, ...params });
}

export function prepareModelPayload(payload, namesMapping, valuesMapping) {
  const result = {};
  const keys = _.intersection(Object.keys(payload), Object.keys(namesMapping));

  for (const key of keys) {
    const mappedKey = namesMapping[key];
    const mappedVal = valuesMapping[key] ? valuesMapping[key](payload[key]) : payload[key];
    result[mappedKey] = mappedVal;
  }

  return result;
}

// These helpers allow to use the IN operator with the empty list of values.
// 'IN <empty list>' always returns 'false' and 'NOT IN <empty list>' always returns 'true'.
// We don't escape 'field' here because pgFormat escaping doesn't work properly with dot-joined
// identifiers (as in 'table.field').

export function sqlIn(field, list) {
  list = List.from(list);

  if (list.isEmpty()) {
    return 'false';
  } else if (list.isEverything()) {
    return 'true';
  }

  return pgFormat(`${field} ${list.inclusive ? 'in' : 'not in'} (%L)`, list.items);
}

export function sqlNotIn(field, list) {
  return sqlIn(field, List.inverse(list));
}

export function sqlIntarrayIn(field, list) {
  list = List.from(list);

  if (list.isEmpty()) {
    return 'false';
  } else if (list.isEverything()) {
    return 'true';
  }

  return pgFormat(`(${list.inclusive ? '' : 'not '}${field} && %L)`, `{${list.items.join(',')}}`);
}

import _ from 'lodash';


export const unexistedUID = '00000000-0000-0000-C000-000000000046';

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

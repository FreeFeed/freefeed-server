import _ from 'lodash';

export const unexistedUID = '00000000-0000-0000-C000-000000000046';

export function initObject(classDef, attrs, id, params) {
  return new classDef({ ...attrs, ...{ id }, ...params });
}

export function prepareModelPayload(payload, namesMapping, valuesMapping) {
  return _.transform(payload, (result, val, key) => {
    let mappedVal = val;
    if (valuesMapping[key]) {
      mappedVal = valuesMapping[key](val);
    }
    const mappedKey = namesMapping[key];
    if (mappedKey) {
      result[mappedKey] = mappedVal;
    }
  });
}

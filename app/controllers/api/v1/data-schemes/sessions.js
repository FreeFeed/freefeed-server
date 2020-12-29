import definitions from './definitions';


export const updateListInputSchema = {
  '$schema': 'http://json-schema.org/schema#',

  definitions,

  type:       'object',
  properties: {
    close: {
      type:        'array',
      default:     [],
      items:       { '$ref': '#/definitions/uuid' },
      uniqueItems: true,
    }
  }
};

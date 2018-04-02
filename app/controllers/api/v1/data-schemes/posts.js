import definitions from './definitions';

export const postCreateInputSchema = {
  '$schema': 'http://json-schema.org/schema#',

  definitions,

  type:       'object',
  required:   ['post', 'meta'],
  properties: {
    post: {
      type:       'object',
      required:   ['body'],
      properties: {
        body: {
          type:      'string',
          minLength: 1,
          pattern:   '\\S'
        },
        attachments: {
          type:    'array',
          default: [],
          items:   { '$ref': '#/definitions/uuid' }
        }
      }
    },
    meta: {
      type:       'object',
      required:   ['feeds'],
      properties: {
        commentsDisabled: { type: 'boolean', default: false },
        feeds:            {
          oneOf: [
            { '$ref': '#/definitions/accountName' },
            {
              type:     'array',
              minItems: 1,
              items:    { '$ref': '#/definitions/accountName' }
            },
          ]
        }
      }
    }
  }
};

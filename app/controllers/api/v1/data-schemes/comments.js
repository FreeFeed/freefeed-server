import definitions from './definitions';

export const commentCreateInputSchema = {
  '$schema': 'http://json-schema.org/schema#',

  definitions,

  type:       'object',
  required:   ['comment'],
  properties: {
    comment: {
      type:       'object',
      required:   ['body', 'postId'],
      properties: {
        body: {
          type:      'string',
          minLength: 1,
          pattern:   '\\S'
        },
        postId: { '$ref': '#/definitions/uuid' }
      }
    }
  }
};

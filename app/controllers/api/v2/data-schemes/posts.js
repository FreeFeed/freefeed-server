import definitions from '../../v1/data-schemes/definitions';

export const getPostsByIdsInputSchema = {
  $schema: 'http://json-schema.org/schema#',

  definitions,

  type: 'object',
  required: ['postIds'],

  properties: {
    postIds: {
      type: 'array',
      items: { $ref: '#/definitions/uuid' },
      uniqueItems: true,
      default: [],
    },
  },
};

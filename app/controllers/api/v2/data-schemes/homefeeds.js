import definitions from '../../v1/data-schemes/definitions';


export const createHomeFeedInputSchema = {
  '$schema': 'http://json-schema.org/schema#',

  type:     'object',
  required: ['title'],

  properties: {
    title: {
      type:      'string',
      pattern:   '\\S',
      minLength: 1,
      maxLength: 250,
    },
  }
};

export const deleteHomeFeedInputSchema = {
  '$schema': 'http://json-schema.org/schema#',

  definitions,

  type:       'object',
  properties: { backupFeed: { '$ref': '#/definitions/uuid' } }
};

export const updateHomeFeedInputSchema = {
  '$schema': 'http://json-schema.org/schema#',

  type:     'object',
  required: ['title'],

  properties: {
    title: {
      type:      'string',
      pattern:   '\\S',
      minLength: 1,
      maxLength: 250,
    },
  }
}

export const reorderHomeFeedsInputSchema = {
  '$schema': 'http://json-schema.org/schema#',

  definitions,

  type:     'object',
  required: ['reorder'],

  properties: {
    reorder: {
      type:        'array',
      items:       { '$ref': '#/definitions/uuid' },
      minItems:    1,
      uniqueItems: true,
    }
  }
}

export const updateHomeFeedSubscriptionsInputSchema = {
  '$schema': 'http://json-schema.org/schema#',

  definitions,

  type: 'object',

  properties: {
    addUsers: {
      type:        'array',
      items:       { '$ref': '#/definitions/uuid' },
      uniqueItems: true,
    },
    removeUsers: {
      type:        'array',
      items:       { '$ref': '#/definitions/uuid' },
      uniqueItems: true,
    },
  }
};

import definitions from '../../v1/data-schemes/definitions';


export const appTokenCreateInputSchema = {
  '$schema': 'http://json-schema.org/schema#',

  definitions,

  type:     'object',
  required: [
    'title',
    'scopes',
    'restrictions',
  ],
  properties: {
    title: {
      type:      'string',
      pattern:   '\\S',
      minLength: 1,
      maxLength: 250,
    },
    scopes: {
      type:        'array',
      items:       { '$ref': '#/definitions/nonEmptyString' },
      uniqueItems: true,
      minItems:    0,
    },
    expiresAt: {
      oneOf: [
        {
          type:        'number',
          description: 'Token lifetime in seconds since creation',
          minimum:     0,
        },
        {
          type:        'string',
          description: 'Token expiration date in ISO 8601 format',
          format:      'date-time',
        }
      ]
    },
    restrictions: {
      type:     'object',
      required: [
        'origins',
        'netmasks',
      ],
      additionalProperties: false,
      default:              { origins: [], netmasks: [] },

      properties: {
        origins: {
          type:        'array',
          items:       { '$ref': '#/definitions/nonEmptyString' },
          uniqueItems: true,
          default:     [],
        },
        netmasks: {
          type:        'array',
          items:       { '$ref': '#/definitions/nonEmptyString' },
          uniqueItems: true,
          default:     [],
        }
      }
    }
  },
}

export const appTokenUpdateInputSchema = {
  '$schema': 'http://json-schema.org/schema#',

  type:     'object',
  required: [
    'title',
  ],

  properties: {
    title: {
      type:      'string',
      pattern:   '\\S',
      minLength: 1,
      maxLength: 250,
    },
  }
};

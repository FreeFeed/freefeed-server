export const freezeUserInputSchema = {
  $schema: 'http://json-schema.org/schema#',

  type: 'object',
  required: ['freezeUntil'],

  properties: {
    freezeUntil: {
      oneOf: [
        { const: 'Infinity' },
        { type: 'string', format: 'date-time' },
        { type: 'string', format: 'date' },
        { type: 'string', pattern: 'P\\w+', description: 'Duration' },
      ],
    },
  },
};

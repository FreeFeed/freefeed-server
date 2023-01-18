export const freezeUserInputSchema = {
  $schema: 'http://json-schema.org/schema#',

  type: 'object',
  required: ['freezeUntil'],

  properties: {
    freezeUntil: { type: 'string', format: 'date-time' },
  },
};

export const authStartInputSchema = {
  $schema: 'http://json-schema.org/schema#',

  type: 'object',
  required: ['provider', 'redirectURL', 'mode'],
  properties: {
    provider: {
      type: 'string',
      maxLength: 50,
    },
    redirectURL: {
      type: 'string',
      pattern: '^https?://',
      maxLength: 250,
    },
    mode: {
      type: 'string',
      enum: ['connect', 'sign-in'],
    },
  },
};

export const authFinishInputSchema = {
  $schema: 'http://json-schema.org/schema#',

  type: 'object',
  required: ['provider', 'query'],
  properties: {
    provider: {
      type: 'string',
      maxLength: 50,
    },
    query: { type: 'object' },
  },
};

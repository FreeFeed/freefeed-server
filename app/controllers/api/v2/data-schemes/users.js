import definitions from '../../v1/data-schemes/definitions';

export const verifyEmailSchema = {
  $schema: 'http://json-schema.org/schema#',

  definitions,

  type: 'object',
  required: ['email'],

  properties: {
    email: { type: 'string' },
  },
};

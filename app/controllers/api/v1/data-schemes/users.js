import definitions from './definitions';


export const userCreateInputSchema = {
  '$schema': 'http://json-schema.org/schema#',

  definitions,

  type:     'object',
  required: [
    'username',
    // In the future API versions email should be required.
    // Currently it would break all legacy tests.
    // 'email',
  ],
  oneOf: [
    { required: ['password'] },
    { required: ['externalProfileKey'] },
  ],
  properties: {
    username:            { '$ref': '#/definitions/userName' },
    screenName:          { type: 'string' },
    email:               { type: 'string' },
    password:            { type: 'string', minLength: 1 },
    captcha:             { type: 'string' },
    invitation:          { type: 'string' },
    cancel_subscription: {
      type:    'boolean',
      default: false,
    },
    externalProfileKey: { type: 'string' },
    profilePictureURL:  {
      type:    'string',
      pattern: '^https?://',
    },
  },
};

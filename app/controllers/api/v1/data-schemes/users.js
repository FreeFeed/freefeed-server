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

export const userSubscribeInputSchema = {
  '$schema': 'http://json-schema.org/schema#',

  definitions,

  type:     'object',
  required: [
    'homeFeeds',
  ],
  default: { homeFeeds: [] },

  properties: {
    homeFeeds: {
      type:        'array',
      items:       { '$ref': '#/definitions/uuid' },
      uniqueItems: true,
      default:     [],
    }
  }
};

export const sendRequestInputSchema = userSubscribeInputSchema;

export const updateSubscriptionInputSchema = {
  '$schema': 'http://json-schema.org/schema#',

  definitions,

  type:     'object',
  required: [
    'homeFeeds',
  ],

  properties: {
    homeFeeds: {
      type:        'array',
      items:       { '$ref': '#/definitions/uuid' },
      uniqueItems: true,
    }
  }
};

export const userSuspendMeInputSchema = {
  '$schema': 'http://json-schema.org/schema#',

  type:     'object',
  required: ['password'],

  properties: {
    password: {
      type:        'string',
      description: 'Current user password'
    }
  }
};


export const userResumeMeInputSchema = {
  '$schema': 'http://json-schema.org/schema#',

  type:     'object',
  required: ['resumeToken'],

  properties: {
    resumeToken: {
      type:        'string',
      description: 'JWT-token for resume account'
    }
  }
};

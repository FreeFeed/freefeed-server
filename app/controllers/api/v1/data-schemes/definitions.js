export default {
  uuid: {
    type: 'string',
    pattern: '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$',
  },
  userName: {
    type: 'string',
    minLength: 3,
    maxLength: 25,
    pattern: '^[A-Za-z0-9]+$',
  },
  groupName: {
    type: 'string',
    minLength: 3,
    maxLength: 35,
    pattern: '^[A-Za-z0-9]+(-[a-zA-Z0-9]+)*$',
  },
  accountName: {
    anyOf: [{ $ref: '#/definitions/userName' }, { $ref: '#/definitions/groupName' }],
  },
  nonEmptyString: {
    type: 'string',
    minLength: 1,
    pattern: '\\S',
  },
};

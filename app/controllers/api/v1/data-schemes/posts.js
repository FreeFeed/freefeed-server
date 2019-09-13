import { load as configLoader } from '../../../../../config/config';

import definitions from './definitions';

const config = configLoader();

export const postCreateInputSchema = {
  $schema: 'http://json-schema.org/schema#',

  definitions,

  type: 'object',
  required: ['post', 'meta'],
  properties: {
    post: {
      type: 'object',
      required: ['body'],
      properties: {
        body: {
          type: 'string',
          minLength: 1,
          pattern: '\\S',
        },
        attachments: {
          type: 'array',
          default: [],
          items: { $ref: '#/definitions/uuid' },
          maxItems: config.attachments.maxCount,
          uniqueItems: true,
        },
      },
    },
    meta: {
      type: 'object',
      required: ['feeds'],
      properties: {
        commentsDisabled: { type: 'boolean', default: false },
        feeds: {
          oneOf: [
            { $ref: '#/definitions/accountName' },
            {
              type: 'array',
              minItems: 1,
              items: { $ref: '#/definitions/accountName' },
            },
          ],
        },
      },
    },
  },
};

export const postUpdateInputSchema = {
  $schema: 'http://json-schema.org/schema#',

  definitions,

  type: 'object',
  required: ['post'],
  properties: {
    post: {
      type: 'object',
      required: [],
      properties: {
        body: {
          type: 'string',
          minLength: 1,
          pattern: '\\S',
        },
        attachments: {
          type: 'array',
          items: { $ref: '#/definitions/uuid' },
          maxItems: config.attachments.maxCount,
          uniqueItems: true,
        },
        feeds: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/definitions/accountName' },
        },
      },
    },
  },
};

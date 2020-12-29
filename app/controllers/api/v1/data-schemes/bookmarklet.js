import config from 'config';

import definitions from './definitions';

/**
 * Bookmarklet schema is based on schemas used by the following
 * clients on 2018-03-14:
 * https://github.com/FreeFeed/freefeed-react-client
 * https://github.com/clbn/freefeed-gamma
 * https://github.com/davidmz/share-on-freefeed-ext
 * http://davidmz.github.io/frf-aprx/ (uses 'image' and do not uses 'meta')
 */

export const bookmarkletCreateInputSchema = {
  $schema: 'http://json-schema.org/schema#',

  definitions,

  type: 'object',

  required: ['title'],
  properties: {
    title: {
      title: 'Body of the creating post',
      type: 'string',
      minLength: 1,
      pattern: '\\S',
    },
    comment: {
      title: 'Body of the first comment',
      type: 'string',
      default: '',
    },
    images: {
      title: 'URLs of images to attach to the post',
      type: 'array',
      default: [],
      items: { type: 'string' },
      maxItems: config.attachments.maxCount,
      uniqueItems: true,
    },
    image: {
      title: 'URLs of a single image to attach to the post',
      type: 'string',
      default: '',
    },
    meta: {
      default: { feeds: [] },
      type: 'object',
      required: ['feeds'],
      properties: {
        feeds: {
          oneOf: [
            { $ref: '#/definitions/accountName' },
            {
              type: 'array',
              items: { $ref: '#/definitions/accountName' },
            },
          ],
        },
      },
    },
  },
};

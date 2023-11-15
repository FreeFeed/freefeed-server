import Ajv from 'ajv';
import _ from 'lodash';
import config from 'config';

import { deepMergeJSON } from '../support/deep-merge';

import { addModel as commentModelMaker } from './comment';
import { addModel as userModelMaker } from './user';

const { defaults, overrides } = config.userPreferences;
type UserPrefs = typeof defaults;

const commentModel = commentModelMaker(null);
const userModel = userModelMaker(null);

const schema = {
  $schema: 'http://json-schema.org/schema#',

  type: 'object',
  properties: {
    hideCommentsOfTypes: {
      title: `Do not show comments with these hideType's`,
      type: 'array',
      uniqueItems: true,
      items: {
        type: 'integer',
        enum: [commentModel.DELETED, commentModel.HIDDEN_BANNED, commentModel.HIDDEN_ARCHIVED],
      },
    },
    sendNotificationsDigest: {
      title: 'Send notifications digest email for current user',
      type: 'boolean',
    },
    sendDailyBestOfDigest: {
      title: 'Send daily Best Of digest email for current user',
      type: 'boolean',
    },
    sendWeeklyBestOfDigest: {
      title: 'Send weekly Best Of digest email for current user',
      type: 'boolean',
    },
    acceptDirectsFrom: {
      title: 'Accept direct messages from all users',
      type: 'string',
      enum: [userModel.ACCEPT_DIRECTS_FROM_ALL, userModel.ACCEPT_DIRECTS_FROM_FRIENDS],
    },
    sanitizeMediaMetadata: {
      title: 'Remove sensitive information (GPS, serial numbers, etc.) from media files',
      type: 'boolean',
    },
    notifyOfCommentsOnMyPosts: {
      title: 'Notify of all comments on my posts',
      type: 'boolean',
    },
  },
  additionalProperties: false,
};

export function defaultPrefs(
  createdAt = new Date(),
  values = defaults,
  defaultOverrides = overrides,
) {
  for (const key of Object.keys(defaultOverrides)) {
    const r = defaultOverrides[key];

    if (
      ('createdBefore' in r && createdAt < new Date(r.createdBefore)) ||
      ('createdSince' in r && createdAt >= new Date(r.createdSince))
    ) {
      // Lodash magic to return the minimal necessary clone of 'defaults'.
      // See https://github.com/lodash/lodash/issues/1696#issuecomment-328335502
      values = _.setWith(_.clone(values), key, r.value, _.clone);
    }
  }

  return values;
}

const ajv = new Ajv({ allErrors: true, useDefaults: true });
const check = ajv.compile<UserPrefs>(schema);

/**
 * Validates and completes absent fields by default values. Throws exception if
 * validation failed (or returns default value if 'safe' argument is true).
 *
 * @param data
 * @param safe - return default value instead of exception throwing
 */
export function validate(
  data: Partial<UserPrefs> = {},
  safe = false,
  createdAtTs: number | string | undefined = undefined,
): UserPrefs {
  if (typeof createdAtTs === 'string') {
    createdAtTs = parseInt(createdAtTs, 10);
  }

  const createdAt = createdAtTs && isFinite(createdAtTs) ? new Date(createdAtTs) : new Date();

  const defs = defaultPrefs(createdAt);
  data = deepMergeJSON(defaultPrefs(createdAt), data) as UserPrefs;
  const valid = check(data);

  if (valid) {
    return data as UserPrefs;
  }

  if (safe) {
    // Return all defaults
    return defs;
  }

  throw new Error(ajv.errorsText(check.errors));
}

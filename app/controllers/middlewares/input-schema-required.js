import Ajv from 'ajv';
import addFormats from 'ajv-formats';

import { ValidationException } from '../../support/exceptions';

const ajv = new Ajv({
  // Break on first error (to shorten error message)
  allErrors: false,
  // Fill the absent fields with default values
  useDefaults: true,
});
addFormats(ajv);

export function inputSchemaRequired(schema) {
  const check = ajv.compile(schema);
  return async (ctx, next) => {
    if (!check(ctx.request.body)) {
      throw new ValidationException(ajv.errorsText(check.errors, { dataVar: 'body' }));
    }

    await next();
  };
}

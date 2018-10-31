import Ajv from 'ajv';

import { ValidationException } from '../../support/exceptions';


const ajv = new Ajv({ allErrors: true, useDefaults: true });

export function inputSchemaRequired(schema) {
  const check = ajv.compile(schema);
  return async (ctx, next) => {
    if (!check(ctx.request.body)) {
      throw new ValidationException(ajv.errorsText(check.errors));
    }
    await next();
  };
}

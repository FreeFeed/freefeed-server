import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { Middleware } from 'koa';
import { ZodType } from 'zod';
import { fromError } from 'zod-validation-error';

import { ValidationException } from '../../support/exceptions';

const ajv = new Ajv({
  // Break on first error (to shorten error message)
  allErrors: false,
  // Fill the absent fields with default values
  useDefaults: true,
});
addFormats(ajv);

/**
 * Accepts a Zod schema object or a JSON schema as a POJO
 */
export function inputSchemaRequired(schema: ZodType | object): Middleware {
  if (schema instanceof ZodType) {
    // Zod schema
    return async (ctx, next) => {
      const result = await schema.safeParseAsync(ctx.request.body);

      if (!result.success) {
        throw new ValidationException(fromError(result.error).message);
      }

      await next();
    };
  }

  const check = ajv.compile(schema);
  return async (ctx, next) => {
    if (!check(ctx.request.body)) {
      throw new ValidationException(ajv.errorsText(check.errors, { dataVar: 'body' }));
    }

    await next();
  };
}

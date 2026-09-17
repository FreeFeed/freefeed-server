// Based on https://github.com/gajus/slonik?tab=readme-ov-file#result-parser-interceptor
import { SchemaValidationError } from 'slonik';
import type { Interceptor, QueryResultRow } from 'slonik';

export const createResultParserInterceptor = (): Interceptor => {
  return {
    name: 'slonik-interceptor-zod-validation',
    // If you are not going to transform results using Zod, then you should use
    // `afterQueryExecution` instead. Future versions of Zod will provide a more
    // efficient parser when parsing without transformations. You can even
    // combine the two – use `afterQueryExecution` to validate results, and
    // (conditionally) transform results as needed in `transformRowAsync`.
    transformRowAsync: async (executionContext, actualQuery, row) => {
      const { resultParser } = executionContext;

      if (!resultParser) {
        return row;
      }

      // It is recommended (but not required) to parse async to avoid blocking
      // the event loop during validation. Standard Schema API:
      // https://github.com/standard-schema/standard-schema
      const validationResult = await resultParser['~standard'].validate(row);

      if (validationResult.issues) {
        throw new SchemaValidationError(actualQuery, row, validationResult.issues);
      }

      return ('value' in validationResult ? validationResult.value : row) as QueryResultRow;
    },
  };
};

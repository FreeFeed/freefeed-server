declare module 'pg-cursor' {
  import { QueryResult, QueryResultRow, CustomTypesConfig } from 'pg';

  interface CursorQueryConfig {
    // by default rows come out as a key/value pair for each row
    // pass the string 'array' here to receive rows as an array of values
    rowMode?: string;

    // custom type parsers just for this query result
    types?: CustomTypesConfig;
  }

  export default class Cursor {
    constructor(text: string, values?: unknown[], config?: CursorQueryConfig);
    read(
      rowCount: Number,
      callback: (err: Error, rows: QueryResultRow[], result: QueryResult) => void,
    ): void;
  }
}

/**
 * Override config to match our configuration shape. This file is to be complete
 * as the code is translated to Typesctipt.
 */
declare module 'config' {
  type Config = {
    host: string;
    attachments: {
      fileSizeLimit: number;
    },
    maintenance: {
      messageFile: string;
    }

    postgres: {
      textSearchConfigName: string;
    }

    search: {
      maxQueryComplexity: number;
      minPrefixLength:    number;
    }
  }

  const c: Config;
  export = c;
}


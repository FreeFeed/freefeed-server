/**
 * Override config to match our configuration shape. This file is to be complete
 * as the code is translated to Typesctipt.
 */
declare module 'config' {
  type Config = {
    siteTitle: string,
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
      minPrefixLength: number;
    }

    company: {
      title: string;
      address: string;
    }

    database: number;
    redis: {
      host: string;
      port: number;
    }
  }

  const c: Config;
  export = c;
}


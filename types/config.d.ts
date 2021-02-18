/**
 * Override config to match our configuration shape. This file is to be complete
 * as the code is translated to Typesctipt.
 */
declare module 'config' {
  type Config = {
    siteTitle: string;
    host: string;
    port: number;
    secret: string;
    appRoot: string;
    trustProxyHeaders: boolean;
    proxyIpHeader: string;
    logResponseTime: boolean;
    attachments: {
      fileSizeLimit: number;
      storage: {
        rootDir: string;
      };
    };
    maintenance: {
      messageFile: string;
    };

    postgres: {
      textSearchConfigName: string;
    };

    search: {
      maxQueryComplexity: number;
      minPrefixLength: number;
    };

    company: {
      title: string;
      address: string;
    };

    database: number;
    redis: {
      host: string;
      port: number;
    };

    sentryDsn?: string;

    authSessions: {
      usageDebounceSec: number;
      reissueGraceIntervalSec: number;
      activeSessionTTLDays: number;
      inactiveSessionTTLDays: number;
      cleanupIntervalSec: number;
    };

    maxLength: {
      post: number;
      comment: number;
      description: number;
    };
  };

  const c: Config;
  export = c;
}

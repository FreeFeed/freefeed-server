/**
 * Override config to match our configuration shape. This file is to be complete
 * as the code is translated to TypeScript.
 */
declare module 'config' {
  export type Config = {
    siteTitle: string;
    host: string;
    port: number;
    secret: string;
    appRoot: string;
    trustProxyHeaders: boolean;
    proxyIpHeader: string;
    logResponseTime: boolean;
    attachments: {
      url: string;
      path: string;
      fileSizeLimit: number;
      storage: {
        rootDir: string;
      };
      sanitizeMetadata: {
        removeTags: RegExp[];
        ignoreTags: RegExp[];
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

    passwordReset: {
      tokenBytesLength: number;
      tokenTTL: number;
    };

    jobManager: {
      pollInterval: number;
      jobLockTime: number;
      maxJobLockTime: number;
      jobLockTimeMultiplier: number;
      batchSize: number;
    };

    userPreferences: {
      defaults: {
        hideCommentsOfTypes: number[];
        sendNotificationsDigest: boolean;
        sendDailyBestOfDigest: boolean;
        sendWeeklyBestOfDigest: boolean;
        acceptDirectsFrom: string;
        sanitizeMediaMetadata: boolean;
      };
      overrides: {
        [k: string]:
          | { createdSince: string; value: unknown }
          | { createdBefore: string; value: unknown };
      };
    };

    mailer: {
      dailyBestOfDigestMailSubject: string;
      weeklyBestOfDigestMailSubject: string;
      notificationDigestEmailSubject: string;
    };

    loggly: {
      subdomain: string;
      token: string;
      tags: string[];
    };

    emailVerification: {
      enabled: boolean;
      domainBlockList: string | null;
      codes: {
        TTL: number;
        limitPerEmail: { count: number; interval: number };
        limitPerIP: { count: number; interval: number };
      };
    };
  };

  const c: Config;
  export default c;
}

// We cannot use regular 'import' in the ambient module
type ISO8601DurationString = import('../app/support/types').ISO8601DurationString;
type InvitationCreationCriterion =
  import('../app/support/types/invitations').InvitationCreationCriterion;

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
    adminEmail: string;
    media: {
      url: string;
      storage: MediaStorage;
      supportedExtensions: string[];
    };
    attachments: {
      url: string;
      storage: MediaStorage;
      path: string;
      sharedMediaDir: string | null;
      fileSizeLimit: number;
      fileSizeLimitByType: {
        image?: number;
        video?: number;
        audio?: number;
        general?: number;
        default: number;
      };
      userMediaProcessingLimit: number;
      maxCount: number;
      sanitizeMetadata: {
        removeTags: RegExp[];
        ignoreTags: RegExp[];
      };
      useImgProxy: boolean;
      previews: PreviewsConfiguration;
    };
    maintenance: {
      messageFile: string;
    };

    recaptcha: {
      enabled: boolean;
      secret: string;
    };

    performance: {
      searchQueriesTimeout: number;
      bcryptRounds: number;
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

    shortLinks: {
      initialLength: {
        post: number;
        comment: number;
        article: number;
      };
      stopWords: string[];
      maxAttempts: number;
      maxLength: number;
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
        notifyOfCommentsOnMyPosts: boolean;
        notifyOfCommentsOnCommentedPosts: boolean;
        pauseMessage: string;
      };
      overrides: Record<
        string,
        { createdSince: string; value: unknown } | { createdBefore: string; value: unknown }
      >;
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

    rateLimit: {
      enabled: boolean;
      allowlist: string[];
      anonymous: {
        duration: ISO8601DurationString;
        maxRequests: number;
        methodOverrides?: Record<
          string,
          { duration?: ISO8601DurationString; maxRequests?: number }
        >;
      };
      authenticated: {
        duration: ISO8601DurationString;
        maxRequests: number;
        methodOverrides?: Record<
          string,
          { duration?: ISO8601DurationString; maxRequests?: number }
        >;
      };
      maskingKeyRotationInterval: ISO8601DurationString;
    };

    ianaTimeZone: string;

    invitations: {
      requiredForSignUp: boolean;
      canCreateIf: InvitationCreationCriterion[];
    };

    translation:
      | { enabled: false }
      | ({
          enabled: true;
          limits: TranslationLimits;
          serviceTitle: string;
        } & ({ service: 'test' } | { service: 'google'; apiKey: string }));

    foldingInPosts: {
      headComments: number;
      tailComments: number;
      minOmittedComments: number;
      headLikes: number;
      minOmittedLikes: number;
    };

    corsProxy: {
      timeout: ISO8601DurationString;
      allowedOrigins: string[];
      allowedUrlPrefixes: string[];
      allowLocalhostOrigins: boolean;
    };

    dailyMails: Record<
      string,
      {
        enabled: boolean;
        sendAt: string;
      }
    >;

    undo: {
      undoInterval: ISO8601DurationString;
    };

    hashtagStats: {
      refreshInterval: number;
    };

    imageMagick: {
      // 'auto' prefers ImageMagick 7 'magick' CLI and falls back to ImageMagick 6
      // legacy 'convert'/'identify' commands. Set to 'legacy' to force ImageMagick 6
      // commands, or to 'magick' / a path to magick to force ImageMagick 7 CLI.
      command: 'auto' | 'legacy' | string;
    };
  };

  export type TranslationLimits = {
    totalCharactersPerMonth: number;
    userCharactersPerDay: number;
  };

  export type PreviewsConfiguration = {
    imagePreviewQuality: number;
    imagePreviewAreas: Record<string, number>;
    legacyImagePreviewSizes: Record<
      string,
      {
        width: number;
        height: number;
      }
    >;
    videoPreviewShortSides: Record<string, number>;
  };

  export type MediaStorage =
    | {
        type: 'fs';
        rootDir: string;
      }
    | {
        type: 's3';
        accessKeyId: string;
        secretAccessKey: string;
        bucket: string;
        region: string;
        s3ConfigOptions: Record<string, unknown>;
      };

  type Util = {
    getEnv(key: string): string;
    loadFileConfigs<C = unknown>(
      configDir: string | null,
      options?: { skipConfigSources?: boolean },
    ): C;
  };

  const c: Config & { util: Util };
  export default c;
}

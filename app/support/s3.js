import { S3 } from '@aws-sdk/client-s3';

export function getS3(storageConfig) {
  const s3Config = {
    credentials: {
      accessKeyId: storageConfig.accessKeyId || null,
      secretAccessKey: storageConfig.secretAccessKey || null,
    },
    ...storageConfig.s3ConfigOptions,
  };

  if ('region' in storageConfig) {
    s3Config.region = storageConfig.region;
  }

  if ('endpoint' in storageConfig) {
    // useful for usage with DigitalOcean Spaces or other S3-compatible services
    s3Config.endpoint = storageConfig.endpoint;
  }

  return new S3(s3Config);
}

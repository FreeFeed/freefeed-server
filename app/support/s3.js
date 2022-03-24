import aws from 'aws-sdk';

aws.config.setPromisesDependency(Promise);

export function getS3(storageConfig) {
  const s3Config = {
    accessKeyId: storageConfig.accessKeyId || null,
    secretAccessKey: storageConfig.secretAccessKey || null,
    ...storageConfig.s3ConfigOptions,
  };

  if ('endpoint' in storageConfig) {
    // useful for usage with DigitalOcean Spaces or other S3-compatible services
    s3Config.endpoint = new aws.Endpoint(storageConfig.endpoint);
  }

  return new aws.S3(s3Config);
}

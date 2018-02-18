import aws from 'aws-sdk';


aws.config.setPromisesDependency(Promise);

export function getS3(storageConfig) {
  const s3Config = {
    'accessKeyId':     storageConfig.accessKeyId || null,
    'secretAccessKey': storageConfig.secretAccessKey || null
  };

  return new aws.S3(s3Config);
}

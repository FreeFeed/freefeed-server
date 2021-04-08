import { ReadStream } from 'fs';

type Promisable = {
  promise(): Promise<void>;
};

type S3Shape = {
  upload(params: S3UploadParams): Promisable;
  deleteObject(params: S3DeleteParams): Promisable;
};

type S3UploadParams = {
  Body: ReadStream;
};

type S3DeleteParams = {
  Key: string;
  Bucket: string;
};

type S3UploadCbParams = Omit<S3UploadParams, 'Body'> & { Body: Buffer };

export function fakeS3({
  onUpload,
  onDelete,
}: {
  onUpload: (params: S3UploadCbParams) => void;
  onDelete: (params: S3DeleteParams) => void;
}): S3Shape {
  return {
    upload(params: S3UploadParams) {
      return {
        promise() {
          return new Promise((resolve) => {
            const chunks = [] as Buffer[];
            params.Body.on('data', function (chunk) {
              chunks.push(chunk as Buffer);
            });

            params.Body.on('end', function () {
              const Body = Buffer.concat(chunks);
              onUpload({ ...params, Body });
              resolve();
            });
          });
        },
      };
    },
    deleteObject(params: S3DeleteParams) {
      return {
        promise() {
          onDelete(params);
          return Promise.resolve();
        },
      };
    },
  };
}

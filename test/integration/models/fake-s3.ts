import { ReadStream } from 'fs';

type S3Shape = {
  putObject(params: S3UploadParams): Promise<void>;
  deleteObject(params: S3DeleteParams): Promise<void>;
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
    putObject(params: S3UploadParams) {
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
    deleteObject(params: S3DeleteParams) {
      onDelete(params);
      return Promise.resolve();
    },
  };
}

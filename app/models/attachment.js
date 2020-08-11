import { promises as fs, createReadStream } from 'fs';
import { execFile } from 'child_process';

import config from 'config';
import { promisify, promisifyAll } from 'bluebird';
import createDebug from 'debug';
import gm from 'gm';
import { parseFile } from 'music-metadata';
import { fromFile } from 'file-type';
import mime from 'mime-types';
import mmm from 'mmmagic';
import _ from 'lodash';
import mv from 'mv';
import gifsicle from 'gifsicle';
import probe from 'probe-image-size';

import { getS3 } from '../support/s3';


const mvAsync = promisify(mv);

const mimeMagic = new mmm.Magic(mmm.MAGIC_MIME_TYPE);
const detectMime = promisify(mimeMagic.detectFile, { context: mimeMagic });

const magic = new mmm.Magic();
const detectFile = promisify(magic.detectFile, { context: magic });

const debug = createDebug('freefeed:model:attachment');

async function mimeTypeDetect(fileName, filePath) {
  // The file type is detected by checking the magic number of the buffer.
  const info = await fromFile(filePath);

  if (info && info.mime && info.mime !== 'application/octet-stream') {
    return info.mime;
  }

  // legacy mmmagic based detection
  let mimeType = 'application/octet-stream';

  try {
    mimeType = await detectMime(filePath);

    if (mimeType === 'application/octet-stream') {
      const typeOfFile = await detectFile(filePath);

      if (typeOfFile.startsWith('Audio file with ID3')) {
        mimeType = 'audio/mpeg';
      }
    }
  } catch (e) {
    if (_.isEmpty(mimeType)) {
      throw e;
    }
  }

  // otherwise, we'll use the fallback to content-type detected with a file extension provided by the user
  if (mimeType === 'application/octet-stream') {
    mimeType = mime.lookup(fileName) || mimeType;
  }

  return mimeType;
}

const execFileAsync = promisify(execFile);

export function addModel(dbAdapter) {
  return class Attachment {
    constructor(params) {
      this.id = params.id;
      this.file = params.file; // FormData File object
      this.fileName = params.fileName; // original file name, e.g. 'cute-little-kitten.jpg'
      this.fileSize = params.fileSize; // file size in bytes
      this.mimeType = params.mimeType; // used as a fallback, in case we can't detect proper one
      this.fileExtension = params.fileExtension; // jpg|png|gif etc.
      this.mediaType = params.mediaType; // image | audio | general

      this.noThumbnail = params.noThumbnail; // if true, image thumbnail URL == original URL
      this.imageSizes = params.imageSizes || {}; // pixel sizes of thumbnail(s) and original image, e.g. {t: {w: 200, h: 175}, o: {w: 600, h: 525}}

      this.artist = params.artist; // filled only for audio
      this.title = params.title; // filled only for audio

      this.userId = params.userId;
      this.postId = params.postId;

      if (parseInt(params.createdAt, 10)) {
        this.createdAt = params.createdAt;
      }

      if (parseInt(params.updatedAt, 10)) {
        this.updatedAt = params.updatedAt;
      }
    }

    get imageSizes() {
      return this.imageSizes_;
    }
    set imageSizes(newValue) {
      if (_.isString(newValue)) {
        newValue = JSON.parse(newValue);
      }

      this.imageSizes_ = newValue;
    }

    validate() {
      const valid =
        this.file &&
        Object.keys(this.file).length > 0 &&
        this.file.path &&
        this.file.path.length > 0 &&
        this.userId &&
        this.userId.length > 0;

      if (!valid) {
        throw new Error('Invalid');
      }
    }

    async create() {
      this.createdAt = new Date().getTime();
      this.updatedAt = new Date().getTime();
      this.postId = this.postId || '';

      await this.validate();

      this.id = await dbAdapter.createAttachment({
        postId:    this.postId,
        createdAt: this.createdAt.toString(),
        updatedAt: this.updatedAt.toString()
      });

      this.fileName = this.file.name;
      this.fileSize = this.file.size;
      this.mimeType = this.file.type;

      // Determine initial file extension
      // (it might be overridden later when we know MIME type from its contents)
      // TODO: extract to config
      const supportedExtensions = /\.(jpe?g|png|gif|mp3|m4a|ogg|wav|txt|pdf|docx?|pptx?|xlsx?)$/i;

      if (this.fileName && this.fileName.match(supportedExtensions) !== null) {
        this.fileExtension = this.fileName
          .match(supportedExtensions)[1]
          .toLowerCase();
      } else {
        this.fileExtension = '';
      }

      await this.handleMedia();

      // Save record to DB
      const params = {
        fileName:      this.fileName,
        fileSize:      this.fileSize,
        mimeType:      this.mimeType,
        mediaType:     this.mediaType,
        fileExtension: this.fileExtension,
        noThumbnail:   this.noThumbnail,
        imageSizes:    JSON.stringify(this.imageSizes),
        userId:        this.userId,
        postId:        this.postId,
        createdAt:     this.createdAt.toString(),
        updatedAt:     this.updatedAt.toString()
      };

      if (this.mediaType === 'audio') {
        params.artist = this.artist;
        params.title = this.title;
      }

      await dbAdapter.updateAttachment(this.id, params);

      return this;
    }

    get url() {
      return (
        config.attachments.url + config.attachments.path + this.getFilename()
      );
    }

    get thumbnailUrl() {
      if (this.noThumbnail === '1') {
        return this.url;
      }

      return this.getResizedImageUrl('t');
    }

    // Get user who created the attachment (via Promise, for serializer)
    getCreatedBy() {
      return dbAdapter.getUserById(this.userId);
    }

    // Get public URL of attachment (via Promise, for serializer)
    getUrl() {
      return (
        config.attachments.url + config.attachments.path + this.getFilename()
      );
    }

    // Get public URL of attachment's thumbnail (via Promise, for serializer)
    getThumbnailUrl() {
      if (this.noThumbnail === '1') {
        return this.getUrl();
      }

      return this.getResizedImageUrl('t');
    }

    // Get public URL of resized image attachment
    getResizedImageUrl(sizeId) {
      return (
        config.attachments.url +
        config.attachments.imageSizes[sizeId].path +
        this.getFilename()
      );
    }

    // Get local filesystem path for original file
    getPath() {
      return (
        config.attachments.storage.rootDir +
        config.attachments.path +
        this.getFilename()
      );
    }

    // Get local filesystem path for resized image file
    getResizedImagePath(sizeId) {
      return (
        config.attachments.storage.rootDir +
        config.attachments.imageSizes[sizeId].path +
        this.getFilename()
      );
    }

    // Get file name
    getFilename() {
      if (this.fileExtension) {
        return `${this.id}.${this.fileExtension}`;
      }

      return this.id;
    }

    // Store the file and process its thumbnail, if necessary
    async handleMedia() {
      const tmpAttachmentFile = this.file.path;
      const tmpAttachmentFileName = this.file.name;

      const supportedImageTypes = {
        'image/jpeg':    'jpg',
        'image/png':     'png',
        'image/gif':     'gif',
        'image/svg+xml': 'svg'
      };
      const supportedAudioTypes = {
        'audio/mpeg':  'mp3',
        'audio/x-m4a': 'm4a',
        'audio/m4a':   'm4a',
        'audio/mp4':   'm4a',
        'audio/ogg':   'ogg',
        'audio/x-wav': 'wav'
      };

      this.mimeType = await mimeTypeDetect(
        tmpAttachmentFileName,
        tmpAttachmentFile
      );
      debug(`Mime-type of ${tmpAttachmentFileName} is ${this.mimeType}`);

      if (supportedImageTypes[this.mimeType]) {
        // Set media properties for 'image' type
        this.mediaType = 'image';
        this.fileExtension = supportedImageTypes[this.mimeType];
        this.noThumbnail = '1'; // this may be overriden below
        await this.handleImage(tmpAttachmentFile);
      } else if (supportedAudioTypes[this.mimeType]) {
        // Set media properties for 'audio' type
        this.mediaType = 'audio';
        this.fileExtension = supportedAudioTypes[this.mimeType];
        this.noThumbnail = '1';

        if (this.fileExtension === 'm4a') {
          this.mimeType = 'audio/mp4'; // mime-type compatible with music-metadata
        }

        // Analyze metadata to get Artist & Title
        const { common: metadata } = await parseFile(tmpAttachmentFile);

        debug(`Metadata of ${tmpAttachmentFileName}`, metadata);

        this.title = metadata.title;

        if (_.isArray(metadata.artist)) {
          [this.artist] = metadata.artist;
        } else {
          this.artist = metadata.artist;
        }
      } else {
        // Set media properties for 'general' type
        this.mediaType = 'general';
        this.noThumbnail = '1';
      }

      // Store an original attachment
      if (config.attachments.storage.type === 's3') {
        await this.uploadToS3(tmpAttachmentFile, config.attachments.path);
        await fs.unlink(tmpAttachmentFile);
      } else {
        await mvAsync(tmpAttachmentFile, this.getPath(), {});
      }
    }

    /**
     * @param {string} originalFile
     */
    async handleImage(originalFile) {
      const tmpResizedFile = (sizeId) => `${this.file.path}.resized.${sizeId}`;

      // Store original image size
      let originalSize = await getImageSize(originalFile);
      this.imageSizes.o = {
        w:   originalSize.width,
        h:   originalSize.height,
        url: await this.getUrl()
      };

      if (this.mimeType === 'image/svg+xml') {
        return;
      }

      // Reserved for GM-style object
      let originalImage = null;

      // Fix EXIF orientation for original image, if JPEG
      if (this.mimeType === 'image/jpeg') {
        originalImage = promisifyAll(gm(originalFile));
        // orientation() returns a string. Possible values are:
        // unknown, Unknown, TopLeft, TopRight, BottomRight, BottomLeft, LeftTop, RightTop, RightBottom, LeftBottom
        // The first three options are fine, the rest should be fixed.
        const orientation = await originalImage.orientationAsync();

        if (!['unknown', 'Unknown', 'TopLeft'].includes(orientation)) {
          const img = originalImage
            .profile(`${__dirname}/../../lib/assets/sRGB.icm`)
            .autoOrient()
            .quality(95);
          await img.writeAsync(originalFile);
          originalImage = promisifyAll(gm(originalFile));
          originalSize = await getImageSize(originalFile);
          this.imageSizes.o.w = originalSize.width;
          this.imageSizes.o.h = originalSize.height;
        }
      }

      const thumbIds = [];

      for (const sizeId of Object.keys(config.attachments.imageSizes)) {
        const { bounds } = config.attachments.imageSizes[sizeId];

        if (
          originalSize.width <= bounds.width &&
          originalSize.height <= bounds.height
        ) {
          continue;
        }

        const size = fitIntoBounds(originalSize, bounds);
        this.imageSizes[sizeId] = {
          w:   size.width,
          h:   size.height,
          url: this.getResizedImageUrl(sizeId)
        };
        thumbIds.push(sizeId);
      }

      if (thumbIds.length === 0) {
        // No thumbnails
        return;
      }

      this.noThumbnail = '0';

      if (this.mimeType === 'image/gif') {
        // Resize gif using gifsicle
        await Promise.all(
          thumbIds.map(async (sizeId) => {
            const { w, h } = this.imageSizes[sizeId];
            await execFileAsync(gifsicle, [
              '--resize',
              `${w}x${h}`,
              '--resize-colors',
              '128',
              '--no-background',
              '-o',
              tmpResizedFile(sizeId),
              originalFile
            ]);
          })
        );
      } else {
        // Iterate over image sizes old-fashioned (and very synchronous) way
        // because gm is acting up weirdly when writing files in parallel mode
        if (originalImage === null) {
          originalImage = promisifyAll(gm(originalFile));
        }

        for (const sizeId of thumbIds) {
          const { w, h } = this.imageSizes[sizeId];
          await originalImage // eslint-disable-line no-await-in-loop
            .resizeExact(w, h)
            .profile(`${__dirname}/../../lib/assets/sRGB.icm`)
            .autoOrient()
            .quality(95)
            .writeAsync(tmpResizedFile(sizeId));
        }
      }

      // Save image (permanently)
      if (config.attachments.storage.type === 's3') {
        await Promise.all(
          thumbIds.map(async (sizeId) => {
            const { path } = config.attachments.imageSizes[sizeId];
            const file = tmpResizedFile(sizeId);
            await this.uploadToS3(file, path);
            await fs.unlink(file);
          })
        );
      } else {
        await Promise.all(
          thumbIds.map(async (sizeId) => {
            const file = tmpResizedFile(sizeId);
            await mvAsync(file, this.getResizedImagePath(sizeId), {});
          })
        );
      }
    }

    // Upload original attachment or its thumbnail to the S3 bucket
    async uploadToS3(sourceFile, destPath) {
      const s3 = getS3(config.attachments.storage);
      await s3
        .upload({
          ACL:                'public-read',
          Bucket:             config.attachments.storage.bucket,
          Key:                destPath + this.getFilename(),
          Body:               createReadStream(sourceFile),
          ContentType:        this.mimeType,
          ContentDisposition: this.getContentDisposition()
        })
        .promise();
    }

    // Get cross-browser Content-Disposition header for attachment
    getContentDisposition() {
      // Old browsers (IE8) need ASCII-only fallback filenames
      const fileNameAscii = this.fileName.replace(/[^\x00-\x7F]/g, '_');

      // Modern browsers support UTF-8 filenames
      const fileNameUtf8 = encodeURIComponent(this.fileName);

      // Inline version of 'attfnboth' method (http://greenbytes.de/tech/tc2231/#attfnboth)
      return `inline; filename="${fileNameAscii}"; filename*=utf-8''${fileNameUtf8}`;
    }

    async destroy() {
      await this.deleteFiles();
      await dbAdapter.deleteAttachment(this.id);
    }

    /**
     * Delete all attachment's files
     */
    async deleteFiles() {
      const thumbIds = Object.keys(this.imageSizes).filter((s) => s !== 'o');

      if (config.attachments.storage.type === 's3') {
        const s3 = getS3(config.attachments.storage);
        const keys = [
          config.attachments.path + this.getFilename(),
          ...thumbIds.map((s) => config.attachments.imageSizes[s].path + this.getFilename()),
        ];

        await Promise.all(
          keys.map(async (Key) => {
            try {
              await s3.deleteObject({
                Key,
                Bucket: config.attachments.storage.bucket,
              }).promise();
            } catch (err) {
              // It is ok if file isn't found
              if (err.code !== 'NotFound') {
                throw err;
              }
            }
          })
        );
      } else {
        const filePaths = [
          this.getPath(),
          ...thumbIds.map((s) => this.getResizedImagePath(s)),
        ];

        await Promise.all(
          filePaths.map(async (filePath) => {
            try {
              await fs.unlink(filePath);
            } catch (err) {
              // It is ok if file isn't found
              if (err.code !== 'ENOENT') {
                throw err;
              }
            }
          })
        );
      }
    }
  };
}

async function getImageSize(fileName) {
  const input = createReadStream(fileName);

  try {
    const { width, height } = await probe(input);
    return { width, height };
  } finally {
    input.destroy();
  }
}

function fitIntoBounds(size, bounds) {
  let width, height;

  if (size.width * bounds.height > size.height * bounds.width) {
    width = bounds.width; // eslint-disable-line prefer-destructuring
    height = Math.max(1, Math.round((size.height * bounds.width) / size.width));
  } else {
    width = Math.max(1, Math.round((size.width * bounds.height) / size.height));
    height = bounds.height; // eslint-disable-line prefer-destructuring
  }

  return { width, height };
}

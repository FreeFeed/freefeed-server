import fs from 'fs'

import aws from 'aws-sdk'
import { promisify, promisifyAll } from 'bluebird'
import gm from 'gm'
import meta from 'musicmetadata'
import mmm from 'mmmagic'
import _ from 'lodash'

import { load as configLoader } from "../../config/config"


let config = configLoader()
promisifyAll(fs)

const mimeMagic = new mmm.Magic(mmm.MAGIC_MIME_TYPE)
const detectMime = promisify(mimeMagic.detectFile, {context: mimeMagic})

const magic = new mmm.Magic()
const detectFile = promisify(magic.detectFile, {context: magic})

async function detectMimetype(filename) {
  const mimeType = await detectMime(filename)

  if (mimeType === 'application/octet-stream') {
    const fileType = await detectFile(filename)

    if (fileType.startsWith('Audio file with ID3')) {
      return 'audio/mpeg'
    }
  }

  return mimeType
}

export function addModel(dbAdapter) {
  /**
   * @constructor
   */
  var Attachment = function(params) {
    this.id = params.id
    this.file = params.file // FormData File object
    this.fileName = params.fileName // original file name, e.g. 'cute-little-kitten.jpg'
    this.fileSize = params.fileSize // file size in bytes
    this.mimeType = params.mimeType // used as a fallback, in case we can't detect proper one
    this.fileExtension = params.fileExtension // jpg|png|gif etc.
    this.noThumbnail = params.noThumbnail // if true, image thumbnail URL == original URL
    this.mediaType = params.mediaType // image | audio | general

    this.artist = params.artist  // filled only for audio
    this.title = params.title   // filled only for audio

    this.userId = params.userId
    this.postId = params.postId

    if (parseInt(params.createdAt, 10))
      this.createdAt = params.createdAt
    if (parseInt(params.updatedAt, 10))
      this.updatedAt = params.updatedAt
  }

  Attachment.className = Attachment
  Attachment.namespace = 'attachment'

  Attachment.prototype.validate = async function() {
    const valid = this.file
               && Object.keys(this.file).length > 0
               && this.file.path
               && this.file.path.length > 0
               && this.userId
               && this.userId.length > 0

    if (!valid)
      throw new Error('Invalid')
  }

  Attachment.prototype.create = async function() {
    this.createdAt = new Date().getTime()
    this.updatedAt = new Date().getTime()
    this.postId = this.postId || ''

    await this.validate()

    this.id = await dbAdapter.createAttachment({
      postId:    this.postId,
      createdAt: this.createdAt.toString(),
      updatedAt: this.updatedAt.toString()
    })

    this.fileName = this.file.name
    this.fileSize = this.file.size
    this.mimeType = this.file.type

    // Determine initial file extension
    // (it might be overridden later when we know MIME type from its contents)
    // TODO: extract to config
    const supportedExtensions = /\.(jpe?g|png|gif|mp3|m4a|ogg|wav|txt|pdf|docx?|pptx?|xlsx?)$/i

    if (this.fileName && this.fileName.match(supportedExtensions) !== null) {
      this.fileExtension = this.fileName.match(supportedExtensions)[1].toLowerCase()
    } else {
      this.fileExtension = ''
    }

    await this.handleMedia()

    // Save record to DB
    const params = {
      fileName: this.fileName,
      fileSize: this.fileSize,
      mimeType: this.mimeType,
      mediaType: this.mediaType,
      fileExtension: this.fileExtension,
      noThumbnail: this.noThumbnail,
      userId: this.userId,
      postId: this.postId,
      createdAt: this.createdAt.toString(),
      updatedAt: this.updatedAt.toString()
    }

    if (this.mediaType === 'audio') {
      params.artist = this.artist
      params.title = this.title
    }

    await dbAdapter.updateAttachment(this.id, params)

    return this
  }

  // Get user who created the attachment (via Promise, for serializer)
  Attachment.prototype.getCreatedBy = function() {
    return dbAdapter.getUserById(this.userId)
  }

  // Get public URL of attachment (via Promise, for serializer)
  Attachment.prototype.getUrl = async function() {
    return config.attachments.url + config.attachments.path + this.getFilename()
  }

  // Get public URL of attachment's thumbnail (via Promise, for serializer)
  Attachment.prototype.getThumbnailUrl = async function() {
    if (this.noThumbnail === '1') {
      return this.getUrl()
    }

    return config.thumbnails.url + config.thumbnails.path + this.getFilename()
  }

  // Get local filesystem path for original file
  Attachment.prototype.getPath = function() {
    return config.attachments.storage.rootDir + config.attachments.path + this.getFilename()
  }

  // Get local filesystem path for thumbnail file
  Attachment.prototype.getThumbnailPath = function() {
    return config.thumbnails.storage.rootDir + config.thumbnails.path + this.getFilename()
  }

  // Get file name
  Attachment.prototype.getFilename = function() {
    if (this.fileExtension) {
      return this.id + '.' + this.fileExtension
    }

    return this.id
  }

  // Store the file and process its thumbnail, if necessary
  Attachment.prototype.handleMedia = async function() {
    var tmpAttachmentFile = this.file.path
    var tmpThumbnailFile = tmpAttachmentFile + '.thumbnail'

    const supportedImageTypes = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/svg+xml': 'svg'
    }
    const supportedAudioTypes = {
      'audio/mpeg': 'mp3',
      'audio/x-m4a': 'm4a',
      'audio/mp4': 'm4a',
      'audio/ogg': 'ogg',
      'audio/x-wav': 'wav'
    }

    // Check a mime type
    try {
      this.mimeType = await detectMimetype(tmpAttachmentFile)
    } catch(e) {
      if (_.isEmpty(this.mimeType)) {
        throw e
      }
      // otherwise, we'll use the fallback provided by the user
    }

    if (supportedImageTypes[this.mimeType]) {
      // Set media properties for 'image' type
      this.mediaType = 'image'
      this.fileExtension = supportedImageTypes[this.mimeType]

      // SVG is special (it's a vector image, so doesn't need resizing)
      if (this.mimeType === 'image/svg+xml') {
        this.noThumbnail = '1'
      } else {
        // Store a thumbnail for a compatible image
        let img = promisifyAll(gm(tmpAttachmentFile))
        let size = await img.sizeAsync()

        if (size.width > 525 || size.height > 175) {
          // Looks big enough, needs a resize
          this.noThumbnail = '0'

          img = img
            .resize(525, 175)
            .profile(__dirname + '/../../lib/assets/sRGB_v4_ICC_preference.icc')
            .autoOrient()
            .quality(95)

          if (config.thumbnails.storage.type === 's3') {
            await img.writeAsync(tmpThumbnailFile)
            await this.uploadToS3(tmpThumbnailFile, config.thumbnails)
            await fs.unlinkAsync(tmpThumbnailFile)
          } else {
            await img.writeAsync(this.getThumbnailPath())
          }
        } else {
          // Since it's small, just use the original image
          this.noThumbnail = '1'
        }
      }
    } else if (supportedAudioTypes[this.mimeType]) {
      // Set media properties for 'audio' type
      this.mediaType = 'audio'
      this.fileExtension = supportedAudioTypes[this.mimeType]
      this.noThumbnail = '1'

      // Analyze metadata to get Artist & Title
      let readStream = fs.createReadStream(tmpAttachmentFile)
      let asyncMeta = promisify(meta)
      let metadata = await asyncMeta(readStream)

      this.title = metadata.title

      if (_.isArray(metadata.artist)) {
        this.artist = metadata.artist[0]
      } else {
        this.artist = metadata.artist
      }
    } else {
      // Set media properties for 'general' type
      this.mediaType = 'general'
      this.noThumbnail = '1'
    }

    // Store an original attachment
    if (config.attachments.storage.type === 's3') {
      await this.uploadToS3(tmpAttachmentFile, config.attachments)
      await fs.unlinkAsync(tmpAttachmentFile)
    } else {
      await fs.renameAsync(tmpAttachmentFile, this.getPath())
    }
  }

  // Upload original attachment or its thumbnail to the S3 bucket
  Attachment.prototype.uploadToS3 = async function(sourceFile, subConfig) {
    let s3 = new aws.S3({
      'accessKeyId': subConfig.storage.accessKeyId || null,
      'secretAccessKey': subConfig.storage.secretAccessKey || null
    })
    let putObject = promisify(s3.putObject, {context: s3})
    await putObject({
      ACL: 'public-read',
      Bucket: subConfig.storage.bucket,
      Key: subConfig.path + this.getFilename(),
      Body: fs.createReadStream(sourceFile),
      ContentType: this.mimeType,
      ContentDisposition: this.getContentDisposition()
    })
  }

  // Get cross-browser Content-Disposition header for attachment
  Attachment.prototype.getContentDisposition = function() {
    // Old browsers (IE8) need ASCII-only fallback filenames
    let fileNameAscii = this.fileName.replace(/[^\x00-\x7F]/g, '_');

    // Modern browsers support UTF-8 filenames
    let fileNameUtf8 = encodeURIComponent(this.fileName)

    // Inline version of 'attfnboth' method (http://greenbytes.de/tech/tc2231/#attfnboth)
    return `inline; filename="${fileNameAscii}"; filename*=utf-8''${fileNameUtf8}`
  }

  return Attachment
}

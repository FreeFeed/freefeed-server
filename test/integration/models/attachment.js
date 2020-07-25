/* eslint-env node, mocha */
/* global $pg_database */
import fs from 'fs'
import path from 'path'

import mkdirp from 'mkdirp'
import gm from 'gm'
import { promisify, promisifyAll } from 'bluebird'
import chai from 'chai'
import chaiFS from 'chai-fs'
import _ from 'lodash';
import config from 'config';

import cleanDB from '../../dbCleaner'
import { dbAdapter, User, Attachment } from '../../../app/models'
import { filesMustExist } from '../helpers/attachments'


chai.use(chaiFS)

const { expect } = chai;
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const stat = promisify(fs.stat);

describe('Attachment', () => {
  before(() => cleanDB($pg_database))

  describe('#create()', () => {
    let user
    let post

    // FormData file objects
    const files = {
      small: {
        size: 708,
        path: '/tmp/upload_12345678901234567890123456789012_1',
        name: 'test-image.150x150.png',
        type: 'image/png'
      },
      medium: {
        size: 1469,
        path: '/tmp/upload_12345678901234567890123456789012_2',
        name: 'test-image.900x300.png',
        type: 'image/png'
      },
      large: {
        size: 3199,
        path: '/tmp/upload_12345678901234567890123456789012_3',
        name: 'test-image.1500x1000.png',
        type: 'image/png'
      },
      xlarge: {
        size: 11639,
        path: '/tmp/upload_12345678901234567890123456789012_4',
        name: 'test-image.3000x2000.png',
        type: 'image/png'
      },
      rotated: {
        size: -1, // do not test
        path: '/tmp/upload_12345678901234567890123456789012_5',
        name: 'test-image-exif-rotated.900x300.jpg',
        type: 'image/jpeg'
      },
      colorprofiled: {
        size: 16698,
        path: '/tmp/upload_12345678901234567890123456789012_6',
        name: 'test-image-sgrb.png',
        type: 'image/png'
      },
      animated: {
        size: 128467,
        path: '/tmp/upload_12345678901234567890123456789012_7',
        name: 'test-image-animated.gif',
        type: 'image/gif'
      },
      audio: {
        size: 16836,
        path: '/tmp/upload_12345678901234567890123456789012_8',
        name: 'sample.mp3',
        type: 'audio/mpeg'
      },
      unknown: {
        size: 16836,
        path: '/tmp/upload_12345678901234567890123456789012_9',
        name: 'sample',
        type: 'audio/mpeg'
      }
    }

    const createdAttachments = new Map();

    const createAndCheckAttachment = async (file, thePost, theUser) => {
      if (createdAttachments.has(file.name)) {
        return createdAttachments.get(file.name);
      }

      const attachment = new Attachment({
        file,
        postId: thePost.id,
        userId: theUser.id
      });

      await attachment.create()
      createdAttachments.set(file.name, attachment)

      attachment.should.be.an.instanceOf(Attachment)
      attachment.should.not.be.empty
      attachment.should.have.property('id')

      const newAttachment = await dbAdapter.getAttachmentById(attachment.id)

      newAttachment.should.be.an.instanceOf(Attachment)
      newAttachment.should.not.be.empty
      newAttachment.should.have.property('id')
      newAttachment.id.should.eql(attachment.id)

      newAttachment.should.have.a.property('mediaType')
      expect(['image', 'audio', 'general']).to.include(newAttachment.mediaType);

      newAttachment.should.have.a.property('fileName')
      newAttachment.fileName.should.be.equal(file.name)

      newAttachment.should.have.a.property('fileSize')
      newAttachment.fileSize.should.be.equal(file.size.toString())

      newAttachment.should.have.a.property('mimeType')
      newAttachment.mimeType.should.be.equal(file.type)

      newAttachment.should.have.a.property('fileExtension')

      newAttachment.getPath().should.be.equal(`${config.attachments.storage.rootDir}${config.attachments.path}${newAttachment.id}.${newAttachment.fileExtension}`)

      const stats = await stat(newAttachment.getPath())

      if (file.size >= 0) {
        stats.size.should.be.equal(file.size)
      } else {
        // Just checking for not-zero size
        stats.size.should.be.above(0)
      }

      return newAttachment
    }

    before(async () => {
      // Create user
      user = new User({
        username: 'Luna',
        password: 'password'
      })
      await user.create()

      // Create directories for attachments
      await mkdirp(config.attachments.storage.rootDir + config.attachments.path);

      await Promise.all(_.map(
        config.attachments.imageSizes,
        (size) => mkdirp(config.attachments.storage.rootDir + size.path)
      ));

      // "Upload" files
      const filesToUpload = {
        'test-image.150x150.png':              '1',
        'test-image.900x300.png':              '2',
        'test-image.1500x1000.png':            '3',
        'test-image.3000x2000.png':            '4',
        'test-image-exif-rotated.900x300.jpg': '5',
        'test-image-sgrb.png':                 '6',
        'test-image-animated.gif':             '7',
        'sample.mp3':                          '8',
        'sample':                              '9'
      };

      const srcPrefix = path.resolve(__dirname, '../../fixtures');
      const targetPrefix = '/tmp/upload_12345678901234567890123456789012_';

      await Promise.all(_.map(filesToUpload, async (target, src) => {
        const data = await readFile(path.resolve(srcPrefix, src));
        return writeFile(`${targetPrefix}${target}`, data);
      }));
    })

    beforeEach(async () => {
      // Create post
      const newPost = await user.newPost({ body: 'Post body' })
      post = await newPost.create()
    })

    afterEach(async () => {
      await post.destroy();
    });

    it('should create a small attachment', async () => {
      const newAttachment = await createAndCheckAttachment(files.small, post, user)

      newAttachment.should.have.a.property('noThumbnail')
      newAttachment.noThumbnail.should.be.equal('1')

      newAttachment.should.have.property('imageSizes')
      newAttachment.imageSizes.should.be.deep.equal({
        o: {
          w:   150,
          h:   150,
          url: `${config.attachments.url}${config.attachments.path}${newAttachment.id}.${newAttachment.fileExtension}`
        }
      })
    })

    it('should create a medium attachment', async () => {
      const newAttachment = await createAndCheckAttachment(files.medium, post, user)

      newAttachment.should.have.a.property('noThumbnail')
      newAttachment.noThumbnail.should.be.equal('0')

      newAttachment.should.have.property('imageSizes')
      newAttachment.imageSizes.should.be.deep.equal({
        o: {
          w:   900,
          h:   300,
          url: `${config.attachments.url}${config.attachments.path}${newAttachment.id}.${newAttachment.fileExtension}`
        },
        t: {
          w:   525,
          h:   175,
          url: `${config.attachments.url}${config.attachments.imageSizes.t.path}${newAttachment.id}.${newAttachment.fileExtension}`
        }
      })
    })

    it('should create a large attachment', async () => {
      const newAttachment = await createAndCheckAttachment(files.large, post, user)

      newAttachment.should.have.a.property('noThumbnail')
      newAttachment.noThumbnail.should.be.equal('0')

      newAttachment.should.have.property('imageSizes')
      newAttachment.imageSizes.should.be.deep.equal({
        o: {
          w:   1500,
          h:   1000,
          url: `${config.attachments.url}${config.attachments.path}${newAttachment.id}.${newAttachment.fileExtension}`
        },
        t: {
          w:   263,
          h:   175,
          url: `${config.attachments.url}${config.attachments.imageSizes.t.path}${newAttachment.id}.${newAttachment.fileExtension}`
        },
        t2: {
          w:   525,
          h:   350,
          url: `${config.attachments.url}${config.attachments.imageSizes.t2.path}${newAttachment.id}.${newAttachment.fileExtension}`
        }
      })
    })

    it('should create an x-large attachment', async () => {
      const newAttachment = await createAndCheckAttachment(files.xlarge, post, user)

      newAttachment.should.have.a.property('noThumbnail')
      newAttachment.noThumbnail.should.be.equal('0')

      newAttachment.should.have.property('imageSizes')
      newAttachment.imageSizes.should.be.deep.equal({
        o: {
          w:   3000,
          h:   2000,
          url: `${config.attachments.url}${config.attachments.path}${newAttachment.id}.${newAttachment.fileExtension}`
        },
        t: {
          w:   263,
          h:   175,
          url: `${config.attachments.url}${config.attachments.imageSizes.t.path}${newAttachment.id}.${newAttachment.fileExtension}`
        },
        t2: {
          w:   525,
          h:   350,
          url: `${config.attachments.url}${config.attachments.imageSizes.t2.path}${newAttachment.id}.${newAttachment.fileExtension}`
        },
        anotherTestSize: {
          w:   1600,
          h:   1067,
          url: `${config.attachments.url}${config.attachments.imageSizes.anotherTestSize.path}${newAttachment.id}.${newAttachment.fileExtension}`
        }
      })
    })

    it('should create a medium attachment with exif rotation', async () => {
      const newAttachment = await createAndCheckAttachment(files.rotated, post, user)

      newAttachment.should.have.a.property('noThumbnail')
      newAttachment.noThumbnail.should.be.equal('0')

      newAttachment.should.have.property('imageSizes')
      newAttachment.imageSizes.should.be.deep.equal({
        o: {
          w:   900,
          h:   300,
          url: `${config.attachments.url}${config.attachments.path}${newAttachment.id}.${newAttachment.fileExtension}`
        },
        t: {
          w:   525,
          h:   175,
          url: `${config.attachments.url}${config.attachments.imageSizes.t.path}${newAttachment.id}.${newAttachment.fileExtension}`
        }
      })
    })

    it('should create a proper colored preview from non-sRGB original', async () => {
      const newAttachment = await createAndCheckAttachment(files.colorprofiled, post, user)

      // original colors
      {
        const original = promisifyAll(gm(newAttachment.getPath()))
        const buffer = await original.resize(1, 1).toBufferAsync('RGB')

        buffer.length.should.be.equal(3)
        buffer[0].should.be.within(191, 193)
        buffer[1].should.be.within(253, 255)
        buffer[2].should.be.within(127, 129)
      }

      // thumbnail colors
      {
        const thumbnailFile = newAttachment.getResizedImagePath('t')
        thumbnailFile.should.be.a.file().and.not.empty

        const thumbnail = promisifyAll(gm(thumbnailFile))
        const buffer = await thumbnail.resize(1, 1).toBufferAsync('RGB')

        buffer.length.should.be.equal(3)
        buffer[0].should.be.within(253, 255)
        buffer[1].should.be.within(191, 193)
        buffer[2].should.be.within(127, 129)
      }
    })

    it('should create a gif attachment', async () => {
      const newAttachment = await createAndCheckAttachment(files.animated, post, user)

      newAttachment.should.have.a.property('noThumbnail')
      newAttachment.noThumbnail.should.be.equal('0')

      newAttachment.should.have.property('imageSizes')
      newAttachment.imageSizes.should.be.deep.equal({
        o: {
          w:   774,
          h:   392,
          url: `${config.attachments.url}${config.attachments.path}${newAttachment.id}.${newAttachment.fileExtension}`
        },
        t: {
          w:   346,
          h:   175,
          url: `${config.attachments.url}${config.attachments.imageSizes.t.path}${newAttachment.id}.${newAttachment.fileExtension}`
        },
        t2: {
          w:   691,
          h:   350,
          url: `${config.attachments.url}${config.attachments.imageSizes.t2.path}${newAttachment.id}.${newAttachment.fileExtension}`
        }
      })
    })

    it('should create an audio attachment', async () => {
      const newAttachment = await createAndCheckAttachment(files.audio, post, user)
      newAttachment.should.have.a.property('mimeType');
      newAttachment.mimeType.should.be.equal('audio/mpeg')
      newAttachment.should.have.a.property('noThumbnail')
      newAttachment.noThumbnail.should.be.equal('1')
      newAttachment.should.have.a.property('mediaType');
      newAttachment.mediaType.should.be.equal('audio')
    })

    it('should create an audio attachment from audio file without extension', async () => {
      const newAttachment = await createAndCheckAttachment(files.unknown, post, user)
      newAttachment.should.have.a.property('mimeType');
      newAttachment.mimeType.should.be.equal('audio/mpeg')
      newAttachment.should.have.a.property('noThumbnail')
      newAttachment.noThumbnail.should.be.equal('1')
      newAttachment.should.have.a.property('mediaType');
      newAttachment.mediaType.should.be.equal('audio')
    })

    it('should remove files of image attachment', async () => {
      const attachment = await createAndCheckAttachment(files.large, post, user);
      await filesMustExist(attachment);
      await attachment.deleteFiles();
      await filesMustExist(attachment, false);
    });

    it('should remove files of audio attachment', async () => {
      const attachment = await createAndCheckAttachment(files.audio, post, user);
      await filesMustExist(attachment);
      await attachment.deleteFiles();
      await filesMustExist(attachment, false);
    });

    it('should destroy attachment object', async () => {
      const attachment = await createAndCheckAttachment(files.audio, post, user);
      await attachment.destroy();

      await filesMustExist(attachment, false);
      const deleted = await dbAdapter.getAttachmentById(attachment.id);
      expect(deleted).to.be.null;
    });
  })
})

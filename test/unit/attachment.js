import fs from 'fs'
import path from 'path'
import mkdirp from 'mkdirp'

import { dbAdapter, User, Attachment } from '../../app/models'
import { load as configLoader } from '../../config/config'

const config = configLoader()

describe('Attachment', function() {
  before(async () => {
    await $database.flushdbAsync()
  })

  describe('#create()', function() {
    let user
    let post
    let files

    const createAndCheckAttachment = async (file, post, user) => {
      const attachment = new Attachment({
        file: file,
        postId: post.id,
        userId: user.id
      })

      await attachment.create()

      attachment.should.be.an.instanceOf(Attachment)
      attachment.should.not.be.empty
      attachment.should.have.property('id')

      const newAttachment = await dbAdapter.getAttachmentById(attachment.id)

      newAttachment.should.be.an.instanceOf(Attachment)
      newAttachment.should.not.be.empty
      newAttachment.should.have.property('id')
      newAttachment.id.should.eql(attachment.id)

      newAttachment.should.have.a.property('mediaType')
      newAttachment.mediaType.should.be.equal('image')

      newAttachment.should.have.a.property('fileName')
      newAttachment.fileName.should.be.equal(file.name)

      newAttachment.should.have.a.property('fileSize')
      newAttachment.fileSize.should.be.equal(file.size.toString())

      newAttachment.should.have.a.property('mimeType')
      newAttachment.mimeType.should.be.equal(file.type)

      newAttachment.should.have.a.property('fileExtension')
      newAttachment.fileExtension.should.be.equal(file.name.match(/\.(\w+)$/)[1])

      newAttachment.getPath().should.be.equal(config.attachments.storage.rootDir + config.attachments.path +
        newAttachment.id + '.' + newAttachment.fileExtension)

      const stats = await fs.statAsync(newAttachment.getPath())
      stats.size.should.be.equal(file.size)

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
      mkdirp.sync(config.attachments.storage.rootDir + config.attachments.path)
      for (let sizeId in config.attachments.imageSizes) {
        if (config.attachments.imageSizes.hasOwnProperty(sizeId)) {
          mkdirp.sync(config.attachments.storage.rootDir + config.attachments.imageSizes[sizeId].path)
        }
      }

      // "Upload" files
      fs.writeFileSync('/tmp/upload_12345678901234567890123456789012_1',
        fs.readFileSync(path.resolve(__dirname, '../fixtures/test-image.150x150.png')));
      fs.writeFileSync('/tmp/upload_12345678901234567890123456789012_2',
        fs.readFileSync(path.resolve(__dirname, '../fixtures/test-image.900x300.png')));
      fs.writeFileSync('/tmp/upload_12345678901234567890123456789012_3',
        fs.readFileSync(path.resolve(__dirname, '../fixtures/test-image.1500x1000.png')));
      fs.writeFileSync('/tmp/upload_12345678901234567890123456789012_4',
        fs.readFileSync(path.resolve(__dirname, '../fixtures/test-image.3000x2000.png')));

      // FormData file objects
      files = {
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
        }
      }
    })

    beforeEach(async () => {
      // Create post
      const newPost = await user.newPost({ body: 'Post body' })
      post = await newPost.create()
    })

    it('should create a small attachment', async () => {
      const newAttachment = await createAndCheckAttachment(files.small, post, user)

      newAttachment.should.have.a.property('noThumbnail')
      newAttachment.noThumbnail.should.be.equal('1')

      newAttachment.should.have.property('imageSizes')
      newAttachment.imageSizes.should.be.deep.equal({
        o: {
          w: 150,
          h: 150,
          url: config.attachments.url + config.attachments.path + newAttachment.id + '.' + newAttachment.fileExtension
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
          w: 900,
          h: 300,
          url: config.attachments.url + config.attachments.path + newAttachment.id + '.' + newAttachment.fileExtension
        },
        t: {
          w: 525,
          h: 175,
          url: config.attachments.url + config.attachments.imageSizes.t.path + newAttachment.id + '.' + newAttachment.fileExtension
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
          w: 1500,
          h: 1000,
          url: config.attachments.url + config.attachments.path + newAttachment.id + '.' + newAttachment.fileExtension
        },
        t: {
          w: 263,
          h: 175,
          url: config.attachments.url + config.attachments.imageSizes.t.path + newAttachment.id + '.' + newAttachment.fileExtension
        },
        t2: {
          w: 525,
          h: 350,
          url: config.attachments.url + config.attachments.imageSizes.t2.path + newAttachment.id + '.' + newAttachment.fileExtension
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
          w: 3000,
          h: 2000,
          url: config.attachments.url + config.attachments.path + newAttachment.id + '.' + newAttachment.fileExtension
        },
        t: {
          w: 263,
          h: 175,
          url: config.attachments.url + config.attachments.imageSizes.t.path + newAttachment.id + '.' + newAttachment.fileExtension
        },
        t2: {
          w: 525,
          h: 350,
          url: config.attachments.url + config.attachments.imageSizes.t2.path + newAttachment.id + '.' + newAttachment.fileExtension
        },
        anotherTestSize: {
          w: 1600,
          h: 1067,
          url: config.attachments.url + config.attachments.imageSizes.anotherTestSize.path + newAttachment.id + '.' + newAttachment.fileExtension
        }
      })
    })
 })
})

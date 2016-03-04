import fs from 'fs'

import mkdirp from 'mkdirp'

import { dbAdapter, User, Attachment } from '../../app/models'
import { load as configLoader } from '../../config/config'


const config = configLoader()

describe('Attachment', function() {
  beforeEach(function(done) {
    $database.flushdbAsync()
      .then(function() { done() })
  })

  describe('#create()', function() {
    var user
      , post
      , file
      , fileContents

    beforeEach(function(done) {
      user = new User({
        username: 'Luna',
        password: 'password'
      })

      // FormData file object
      file = {
        size: 43,
        path: '/tmp/upload_12345678901234567890123456789012',
        name: 'tiny.gif',
        type: 'image/gif'
      }

      // Base64-encoded contents of a tiny GIF file
      fileContents = 'R0lGODlhAQABAIABAP///wAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

      var postAttrs = { body: 'Post body' }

      user.create()
        .then(function(user) { return user.newPost(postAttrs) })
        .then(function(newPost) { return newPost.create() })
        .then(function(newPost) { post = newPost })
        .then(function() {
          // Create directories for attachments
          mkdirp.sync(config.attachments.storage.rootDir + config.attachments.path)
          mkdirp.sync(config.thumbnails.storage.rootDir + config.thumbnails.path)
        })
        .then(function() {
          // "Upload" tiny GIF image
          var imageBuffer = new Buffer(fileContents, 'base64')
          fs.writeFile(file.path, imageBuffer, function () {
            done()
          })
        })
    })

    it('should create an attachment', function(done) {
      var attachment = new Attachment({
        file: file,
        postId: post.id,
        userId: user.id
      })

      attachment.create()
        .then(function(newAttachment) {
          newAttachment.should.be.an.instanceOf(Attachment)
          newAttachment.should.not.be.empty
          newAttachment.should.have.property('id')
          return dbAdapter.getAttachmentById(attachment.id)
        }).then(function(newAttachment) {
          newAttachment.should.be.an.instanceOf(Attachment)
          newAttachment.should.not.be.empty
          newAttachment.should.have.property('id')
          newAttachment.id.should.eql(attachment.id)
          return newAttachment
        }).then(function(newAttachment) {
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

          newAttachment.should.have.a.property('noThumbnail')
          newAttachment.noThumbnail.should.be.equal('1')

          newAttachment.should.have.deep.property('imageSizes.t.w')
          newAttachment.imageSizes.t.w.should.be.equal(1)
          newAttachment.should.have.deep.property('imageSizes.t.h')
          newAttachment.imageSizes.t.h.should.be.equal(1)
          newAttachment.should.have.deep.property('imageSizes.o.w')
          newAttachment.imageSizes.o.w.should.be.equal(1)
          newAttachment.should.have.deep.property('imageSizes.o.h')
          newAttachment.imageSizes.o.h.should.be.equal(1)

          newAttachment.getPath().should.be.equal(config.attachments.storage.rootDir + config.attachments.path +
            newAttachment.id + '.' + newAttachment.fileExtension)
          fs.stat(newAttachment.getPath(), function(err, stats) {
            stats.size.should.be.equal(file.size)
            done()
          })
        }).catch(function(e) { done(e) })
    })
  })
})

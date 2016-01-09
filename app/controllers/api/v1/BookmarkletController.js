import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import url from 'url'

import { promisifyAll } from 'bluebird'
import fetch from 'node-fetch'
import { wait as waitForStream } from 'promise-streams'

import { PostSerializer } from '../../../models'
import exceptions from '../../../support/exceptions'


promisifyAll(fs)

const getAttachments = async function(author, imageUrl) {
  if (!url) {
    return []
  }

  const p = url.parse(imageUrl)

  let ext = path.extname(p.pathname).split('.')
  ext = ext[ext.length - 1]

  const originalFileName = p.pathname.split('/').pop()

  const bytes = crypto.randomBytes(4).readUInt32LE(0)
  const fileName = `pepyatka${bytes}tmp.${ext}`
  const filePath = `/tmp/${fileName}`

  const response = await fetch(imageUrl)

  const fileType = response.headers.get('content-type')
  const stream = fs.createWriteStream(filePath, {flags: 'w'})

  await waitForStream(response.body.pipe(stream))
  const stats = await fs.statAsync(filePath)

  const file = {
    name: originalFileName,
    size: stats.size,
    type: fileType,
    path: filePath
  }

  const newAttachment = await author.newAttachment({ file })
  await newAttachment.create()

  return [newAttachment.id]
}

export default class BookmarkletController {
  static async create(req, res) {
    try {
      if (!req.user) {
        return res.status(401).jsonp({err: 'Not found'})
      }

      // Download image and create attachment
      let attachments = await getAttachments(req.user, req.body.image)

      // Create post
      let newPost = await req.user.newPost({
        body: req.body.title,
        attachments: attachments
      })
      await newPost.create()

      // Create comment
      if (req.body.comment) {
        var newComment = await req.user.newComment({
          body: req.body.comment,
          postId: newPost.id
        })

        await newComment.create()
      }

      // Send response with the created post
      let json = await new PostSerializer(newPost).promiseToJSON()
      res.jsonp(json)
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }
}

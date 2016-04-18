import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import url from 'url'

import _ from 'lodash'
import { promisifyAll } from 'bluebird'
import fetch from 'node-fetch'
import { wait as waitForStream } from 'promise-streams'

import { dbAdapter, PostSerializer } from '../../../models'
import exceptions, { NotFoundException } from '../../../support/exceptions'


promisifyAll(fs)

const getAttachments = async function(author, imageUrl) {
  if (!imageUrl) {
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
        res.status(401).jsonp({err: 'Not found'})
        return
      }

      // TODO: code copypasted (with small change about how to deal with empty feeds) from PostsController#create
      // need to refactor this part or merge this two controllers
      let feeds = []
      if (req.body.meta && _.isArray(req.body.meta.feeds)) {
        feeds = req.body.meta.feeds
      } else if (req.body.meta && req.body.meta.feeds) {
        feeds = [req.body.meta.feeds]
      } else { // if no feeds specified post into personal one
        feeds = [req.user.username]
      }

      let promises = feeds.map(async (username) => {
        let feed = await dbAdapter.getFeedOwnerByUsername(username)

        if (null === feed) {
          throw new NotFoundException(`Feed "${username}" is not found`)
        }

        await feed.validateCanPost(req.user)

        // we are going to publish this message to posts feed if
        // it's my home feed or group's feed, otherwise this is a
        // private message that goes to its own feed(s)
        if (
          (feed.isUser() && feed.id == req.user.id) ||
          !feed.isUser()
        ) {
          return feed.getPostsTimelineId()
        }

        // private post goes to sendee and sender
        return await Promise.all([
          feed.getDirectsTimelineId(),
          req.user.getDirectsTimelineId()
        ])
      })
      let timelineIds = _.flatten(await Promise.all(promises))

      // Download image and create attachment
      let attachments = await getAttachments(req.user, req.body.image)

      // Create post
      let newPost = await req.user.newPost({
        body: req.body.title,
        attachments: attachments,
        timelineIds: timelineIds
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

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import url from 'url'

import _ from 'lodash'
import { promisifyAll } from 'bluebird'
import fetch from 'node-fetch'
import { wait as waitForStream } from 'promise-streams'

import { dbAdapter, PostSerializer } from '../../../models'
import { NotFoundException } from '../../../support/exceptions'


promisifyAll(fs)

const getAttachment = async function (author, imageUrl) {
  if (!imageUrl) {
    return null;
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
  const stream = fs.createWriteStream(filePath, { flags: 'w' })

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

  return newAttachment.id
}

const getAttachments = async function (author, imageUrls) {
  const promises = imageUrls.map((url) => getAttachment(author, url))
  return await Promise.all(promises)
}

export default class BookmarkletController {
  static async create(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Not found' };
      return;
    }

    // TODO: code copypasted (with small change about how to deal with empty feeds) from PostsController#create
    // need to refactor this part or merge this two controllers
    let feeds = []
    if (ctx.request.body.meta && _.isArray(ctx.request.body.meta.feeds)) {
      feeds = ctx.request.body.meta.feeds
    } else if (ctx.request.body.meta && ctx.request.body.meta.feeds) {
      feeds = [ctx.request.body.meta.feeds]
    } else { // if no feeds specified post into personal one
      feeds = [ctx.state.user.username]
    }

    const promises = feeds.map(async (username) => {
      const feed = await dbAdapter.getFeedOwnerByUsername(username)

      if (null === feed) {
        return null
      }

      await feed.validateCanPost(ctx.state.user)

      // we are going to publish this message to posts feed if
      // it's my home feed or group's feed, otherwise this is a
      // private message that goes to its own feed(s)
      if (
        (feed.isUser() && feed.id == ctx.state.user.id) ||
        !feed.isUser()
      ) {
        return feed.getPostsTimelineId()
      }

      // private post goes to sendee and sender
      return await Promise.all([
        feed.getDirectsTimelineId(),
        ctx.state.user.getDirectsTimelineId()
      ])
    })
    const timelineIds = _.flatten(await Promise.all(promises))
    _.each(timelineIds, (id, i) => {
      if (null == id) {
        throw new NotFoundException(`Feed "${feeds[i]}" is not found`)
      }
    })

    // Download image(s) and create attachment
    const imageUrls = ctx.request.body.images || [ctx.request.body.image]
    const attachments = await getAttachments(ctx.state.user, imageUrls)

    // Create post
    const newPost = await ctx.state.user.newPost({
      body: ctx.request.body.title,
      attachments,
      timelineIds
    })
    await newPost.create()

    // Create comment
    if (ctx.request.body.comment) {
      const newComment = await ctx.state.user.newComment({
        body:   ctx.request.body.comment,
        postId: newPost.id
      })

      await newComment.create()
    }

    // Send response with the created post
    const json = new PostSerializer(newPost).promiseToJSON();
    ctx.body = await json;
  }
}

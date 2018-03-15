import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';

import compose from 'koa-compose';
import mediaType from 'media-type';
import { promisifyAll } from 'bluebird';
import fetch from 'node-fetch';
import { wait as waitStream, pipeline } from 'promise-streams';
import meter from 'stream-meter';
import { parse as bytesParse } from 'bytes';

import { Post, Comment } from '../../../models';
import { ForbiddenException } from '../../../support/exceptions';
import { authRequired, monitored, inputSchemaRequired } from '../../middlewares';
import { show as showPost } from '../v2/PostsController';
import { load as configLoader } from '../../../../config/config';
import { bookmarkletCreateInputSchema } from './data-schemes';
import { checkDestNames } from './PostsController';


promisifyAll(fs);

const config = configLoader();
const fileSizeLimit = bytesParse(config.attachments.fileSizeLimit);

export const create = compose([
  authRequired(),
  inputSchemaRequired(bookmarkletCreateInputSchema),
  monitored('bookmarklet.create'),
  async (ctx) => {
    const { user: author } = ctx.state;
    const {
      meta: { feeds },
      title: body,
      comment: commentBody,
      images,
      image,
    } = ctx.request.body;

    const destNames = (typeof feeds === 'string') ? [feeds] : feeds;
    if (destNames.length === 0) {
      destNames.push(author.username);
    }
    const timelineIds = await checkDestNames(destNames, author);

    // Attachments
    if (images.length === 0 && image !== '') {
      // Only use 'image' if 'images' is empty
      images.push(image);
    }


    const attachments = await Promise.all(images.map(async (url) => {
      try {
        return await createAttachment(author, url);
      } catch (e) {
        throw new ForbiddenException(`Unable to load URL '${url}': ${e.message}`);
      }
    }));

    const post = new Post({
      userId: author.id,
      body,
      attachments,
      timelineIds,
    });
    await post.create();

    if (commentBody !== '') {
      const comment = new Comment({
        body:   commentBody,
        postId: post.id,
        userId: author.id
      });
      await comment.create();
    }

    ctx.params.postId = post.id;
    await showPost(ctx);
  },
]);

async function createAttachment(author, imageURL) {
  const parsedURL = new URL(imageURL);
  if (parsedURL.protocol !== 'http:' && parsedURL.protocol !== 'https:') {
    throw new Error('Unsupported URL protocol');
  }

  const parsedPath = path.parse(parsedURL.pathname);
  const originalFileName = parsedPath.base !== '' ? parsedPath.base : 'file';

  const bytes = crypto.randomBytes(4).readUInt32LE(0);
  const filePath = `/tmp/pepyatka${bytes}tmp${parsedPath.ext}`;

  const response = await fetch(parsedURL.href);
  if (response.status !== 200) {
    throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
  }

  const mType = mediaType.fromString(response.headers.get('content-type'));
  if (mType.type !== 'image') {
    throw new Error(`Unsupported content type: '${mType.asString() || '-'}'`);
  }

  if (response.headers.has('content-length')) {
    const contentLength = parseInt(response.headers.get('content-length'));
    if (!isNaN(contentLength) && contentLength > fileSizeLimit) {
      throw new Error(`File is too large (${contentLength} bytes, max. ${fileSizeLimit})`);
    }
  }

  const stream = fs.createWriteStream(filePath, { flags: 'w' });
  await pipeline(
    response.body,
    meter(fileSizeLimit),
    stream,
  );
  await waitStream(stream); // waiting for the file to be written and closed
  const stats = await fs.statAsync(filePath);

  const file = {
    name: originalFileName,
    size: stats.size,
    type: mType.asString(),
    path: filePath,
  }

  const newAttachment = author.newAttachment({ file });
  await newAttachment.create();

  return newAttachment.id;
}

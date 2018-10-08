import compose from 'koa-compose';
import builder from 'xmlbuilder';

import { load as configLoader } from '../../../../config/config';
import { extractTitle, getBodyHTML } from '../../../support/rss-text-parser';
import { monitored } from '../../middlewares';
import { userTimeline, ORD_CREATED } from './TimelinesController';

const config = configLoader();
const SERVICE_NAME = 'FreeFeed.net';
const TITILE_MAX_LEN = 60;

export const timelineRSS = compose([
  monitored('timelines.rss'),
  async (ctx) => {
    ctx.request.sort = ORD_CREATED;
    await userTimeline('Posts')(ctx);
    if (ctx.status !== 200) {
      return;
    }
    ctx.type = 'application/xml';
    ctx.body = timelineToRSS(ctx.body);
  },
]);

function timelineToRSS(data) {
  const ownerId = data.timelines.user;
  const owner = data.users.find((u) => u.id === ownerId);
  const rss = builder.create('rss')
    .att('version', '2.0')
  const channel = rss
    .ele('channel')
    .ele('title', {}, `${owner.username} @ ${SERVICE_NAME}`).up()
    .ele('link', {}, `${config.host}/${owner.username}`).up()
    .ele('description', {}, owner.description).up();
  if (owner.profilePictureLargeUrl !== '') {
    channel.ele('image')
      .ele('url', {}, owner.profilePictureLargeUrl).up()
      .ele('title', {}, `${owner.username} @ ${SERVICE_NAME}`).up()
      .ele('link', {}, `${config.host}/${owner.username}`).up();
  }

  for (const postID of data.timelines.posts) {
    const post = data.posts.find((p) => p.id === postID);
    const item = channel.ele('item')
      .ele('guid', {}, `freefeed:post:${post.id}`).up()
      .ele('pubDate', {}, new Date(+post.createdAt).toGMTString()).up()
      .ele('link', {}, `${config.host}/${owner.username}/${post.id}`).up()
      .ele('title', {}, extractTitle(post.body, TITILE_MAX_LEN)).up()
      .ele('description', {}, getBodyHTML(post.body)).up();
    for (const attID of post.attachments) {
      const attach = data.attachments.find((a) => a.id === attID);
      item.ele('enclosure')
        .att('url', attach.url)
        .att('length', attach.fileSize)
        .att('type', attachMimeType(attach));
    }
  }
  return rss.end({ pretty: true });
}

function attachMimeType({ url, mediaType }) {
  const m = /\.(\w+)$/.exec(url)
  const ext = m ? m[1] : '';
  if (mediaType === 'image') {
    if (ext === 'png') {
      return 'image/png';
    } else if (ext === 'gif') {
      return 'image/gif';
    } else if (ext === 'svg') {
      return 'image/svg+xml';
    }
    return 'image/jpeg';
  } else if (mediaType === 'audio') {
    if (ext === 'm4a') {
      return 'audio/m4a';
    } else if (ext === 'ogg') {
      return 'audio/ogg';
    } else if (ext === 'wav') {
      return 'audio/x-wav';
    }
    return 'audio/mpeg';
  }
  return 'application/octet-stream';
}

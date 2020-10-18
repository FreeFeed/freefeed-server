import { escape as urlEscape } from 'querystring';

import config from 'config';
import { escape as htmlEscape } from 'lodash';
import compose from 'koa-compose';
import builder from 'xmlbuilder';

import { dbAdapter } from '../../../models';
import { extractTitle, textToHTML } from '../../../support/rss-text-parser';
import { monitored } from '../../middlewares';
import { serializeComment } from '../../../serializers/v2/post';

import { userTimeline, ORD_CREATED } from './TimelinesController';


const TITILE_MAX_LEN = 60;
const ommitBubblesThreshold = 600 * 1000; // 10 min in ms

export const timelineRSS = compose([
  monitored('timelines.rss'),
  async (ctx) => {
    ctx.request.sort = ORD_CREATED;
    await userTimeline('Posts')(ctx);

    if (ctx.status !== 200) {
      return;
    }

    ctx.type = 'application/xml';
    ctx.body = await timelineToRSS(ctx.body, ctx);
  },
]);

async function timelineToRSS(data, ctx) {
  const ownerId = data.timelines.user;
  const owner = data.users.find((u) => u.id === ownerId);
  const isGroup = owner.type === 'group';
  const feedTitle = isGroup ? `Posts in group ${owner.username}` : `Posts of ${owner.username}`;
  const rss = builder.create('rss')
    .att('version', '2.0')
  const channel = rss
    .ele('channel')
    .ele('title', {}, `${feedTitle} @ ${config.siteTitle}`).up()
    .ele('link', {}, `${config.host}/${urlEscape(owner.username)}`).up()
    .ele('description', {}, owner.description).up();

  const userpic = owner.profilePictureLargeUrl || config.profilePictures.defaultProfilePictureMediumUrl;
  channel.ele('image')
    .ele('url', {}, userpic).up()
    .ele('title', {}, `${feedTitle} @ ${config.siteTitle}`).up()
    .ele('link', {}, `${config.host}/${urlEscape(owner.username)}`).up();

  const postMakers = await Promise.all(data.timelines.posts.map((postId) => postItemMaker(postId, data, ctx)));

  for (const mk of postMakers) {
    mk(channel);
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

async function postItemMaker(postId, data, ctx) {
  const ownerId = data.timelines.user;
  const feedOwner = data.users.find((u) => u.id === ownerId);
  const isGroup = feedOwner.type === 'group';

  const post = data.posts.find((p) => p.id === postId);
  const author = data.users.find((u) => u.id === post.createdBy);
  let title = extractTitle(post.body, TITILE_MAX_LEN);

  if (isGroup) {
    title = `${author.username}: ${title}`;
  }

  const userpic = author.profilePictureLargeUrl || config.profilePictures.defaultProfilePictureMediumUrl;
  const descriptionLines = [
    `<p class="freefeed-author">`,
    `<a href="${config.host}/${urlEscape(author.username)}"><img src="${userpic}" width="50" height="50"></a>`,
    `<a href="${config.host}/${urlEscape(author.username)}"><strong>${htmlEscape(author.username)}</strong></a>:`,
    `</p>`,
    `<div class="freefeed-post">`,
    textToHTML(post.body),
    `</div>`,
  ];

  const attachments = post.attachments.map((id) => data.attachments.find((a) => a.id === id));
  const imageAtts = attachments.filter(({ mediaType }) => mediaType === 'image');
  const audioAtts = attachments.filter(({ mediaType }) => mediaType === 'audio');
  const otherAtts = attachments.filter(({ mediaType }) => mediaType !== 'image' && mediaType !== 'audio');

  if (imageAtts.length > 0) {
    const tags = imageAtts.map((a) => {
      const sz = a.imageSizes.t || a.imageSizes.o;

      if (!sz) {
        // Some very old images has empty imageSizes object
        return `<a href="${htmlEscape(a.url)}"><img src="${htmlEscape(a.url)}"></a>`;
      }

      return `<a href="${htmlEscape(a.url)}"><img src="${htmlEscape(sz.url)}" width="${htmlEscape(sz.w)}" height="${htmlEscape(sz.h)}"></a>`;
    });
    descriptionLines.push(`<p class="freefeed-images">${tags.join(' ')}</p>`);
  }

  descriptionLines.push(...audioAtts.map(
    (a) => `<p class="freefeed-attachment">🎵 <a href="${htmlEscape(a.url)}">${htmlEscape(a.title ? `${a.title} (${a.fileName})` : a.fileName)}</a></p>`)
  );
  descriptionLines.push(...otherAtts.map(
    (a) => `<p class="freefeed-attachment">📄 <a href="${htmlEscape(a.url)}">${htmlEscape(a.fileName)}</a></p>`)
  );

  let comments = post.comments.map((id) => data.comments.find((c) => c.id === id));

  if (
    post.comments.length > 0 &&
    comments[0].createdBy === post.createdBy &&
     (+comments[0].createdAt) - (+post.createdAt) < ommitBubblesThreshold
  ) {
    if (post.omittedComments > 0) {
      comments = await loadAllComments(postId, ctx);
    }

    let prevTime = +post.createdAt;

    for (const comment of comments) {
      if ((+comment.createdAt) - prevTime >= ommitBubblesThreshold || comment.createdBy !== post.createdBy) {
        break;
      }

      prevTime = +comment.createdAt;
      descriptionLines.push([`<div class="freefeed-comment" style="margin-left: 1em; margin-top: 2em;">${textToHTML(comment.body)}</div>`]);
    }
  }

  return (channel) => {
    const item = channel.ele('item')
      .ele('guid', {}, `freefeed:post:${post.id}`).up()
      .ele('pubDate', {}, new Date(+post.createdAt).toGMTString()).up()
      .ele('link', {}, `${config.host}/${urlEscape(feedOwner.username)}/${urlEscape(post.id)}`).up()
      .ele('author', {}, author.username).up()
      .ele('title', {}, title).up()
      .ele('description', {}, descriptionLines.join('\n')).up();

    for (const attach of attachments) {
      item.ele('enclosure')
        .att('url', attach.url)
        .att('length', attach.fileSize)
        .att('type', attachMimeType(attach));
    }
  }
}

async function loadAllComments(postId, ctx) {
  const { user: viewer } = ctx.state;
  const [postWithStuff] = await dbAdapter.getPostsWithStuffByIds(
    [postId],
    viewer ? viewer.id : null,
    { foldComments: false },
  );

  return postWithStuff ? postWithStuff.comments.map(serializeComment) : [];
}

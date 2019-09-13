/* eslint-disable no-await-in-loop */
import { promisify } from 'util';

import moment from 'moment';
import N3 from 'n3';
import PgCursor from 'pg-cursor';
import pgFormat from 'pg-format';
import noop from 'lodash/noop';

import { load as configLoader } from '../../config/config';

const { literal, namedNode, quad } = N3.DataFactory;
const config = configLoader();

const schema = 'http://schema.org/';
const frf = 'http://freefeed.net/';
const rdfs = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';

export const prefixes = { schema, rdfs };

const schemaType = (id, typeName) =>
  quad(namedNode(id), namedNode(`${rdfs}type`), namedNode(`${schema}${typeName}`));

const intToIso = (timestamp) => moment(parseInt(timestamp)).format();
const fixIso = (badIsoTimestamp) => moment(badIsoTimestamp).format();

const createdAt = (id, isoTimestamp) =>
  quad(namedNode(id), namedNode(`${schema}dateCreated`), literal(isoTimestamp));

const updatedAt = (id, isoTimestamp) =>
  quad(namedNode(id), namedNode(`${schema}dateModified`), literal(isoTimestamp));

const hasBlogPost = (blogId, postId) =>
  quad(namedNode(blogId), namedNode(`${schema}blogPost`), namedNode(postId));

const objUrl = (id, url) => quad(namedNode(id), namedNode(`${schema}url`), literal(url));

const objIdentifier = (id, identifier) =>
  quad(namedNode(id), namedNode(`${schema}identifier`), literal(identifier));

const objName = (id, name) => quad(namedNode(id), namedNode(`${schema}name`), literal(name));

const objDescription = (id, description) =>
  quad(namedNode(id), namedNode(`${schema}description`), literal(description));

const hasText = (objectId, text) =>
  quad(namedNode(objectId), namedNode(`${schema}text`), literal(text));

const hasComment = (postId, commentId) =>
  quad(namedNode(postId), namedNode(`${schema}comment`), namedNode(commentId));

const hasAttachment = (postId, attachmentId) =>
  quad(namedNode(postId), namedNode(`${schema}sharedContent`), namedNode(attachmentId));

const hasMimetype = (objId, mimeType) =>
  quad(namedNode(objId), namedNode(`${schema}encodingFormat`), literal(mimeType));

const hasFilename = (objId, filename) =>
  quad(namedNode(objId), namedNode(`${schema}alternateName`), literal(filename));

const hasUpvoteCount = (commentId, count) =>
  quad(namedNode(commentId), namedNode(`${schema}upvoteCount`), literal(parseInt(count)));

const hasAuthor = (objectId, authorId) =>
  quad(namedNode(objectId), namedNode(`${schema}author`), namedNode(authorId));

const actionAgent = (actionId, agentId) =>
  quad(namedNode(actionId), namedNode(`${schema}agent`), namedNode(agentId));

const actionObject = (actionId, objectId) =>
  quad(namedNode(actionId), namedNode(`${schema}object`), namedNode(objectId));

const actionStart = (actionId, isoTimestamp) =>
  quad(namedNode(actionId), namedNode(`${schema}startTime`), literal(isoTimestamp));

const messageSender = (messageId, userId) =>
  quad(namedNode(messageId), namedNode(`${schema}sender`), namedNode(userId));

const messageRecipient = (messageId, userId) =>
  quad(namedNode(messageId), namedNode(`${schema}recipient`), namedNode(userId));

export class DataProvider {
  dbAdapter;

  constructor(dbAdapter) {
    this.dbAdapter = dbAdapter;
  }

  async userTimelineAsQuads(userUuid) {
    process.stdout.write(`- getting user-data\n`);
    const user = await this.dbAdapter.getFeedOwnerById(userUuid);

    const knex = this.dbAdapter.database;
    const pg = await knex.client.acquireConnection();

    const writer = N3.Writer({
      format: 'N-Triples',
      prefixes,
    });

    const addQuad = promisify(writer.addQuad).bind(writer);
    const getResult = promisify(writer.end).bind(writer);

    const blogId = `urn:uuid:${user.id}`;

    await addQuad(schemaType(blogId, 'Blog'));
    await addQuad(objUrl(blogId, `https://freefeed.net/${user.username}`));
    await addQuad(objIdentifier(blogId, user.username));
    await addQuad(objName(blogId, user.screenName));
    await addQuad(objDescription(blogId, user.description));
    await addQuad(createdAt(blogId, intToIso(user.createdAt)));
    await addQuad(updatedAt(blogId, intToIso(user.updatedAt)));

    const otherUsers = new Set();

    const commentsAsQuads = async function(postUuid, postResourceId) {
      const comments = await knex.raw(
        'SELECT "u"."uid", "u"."username", "u"."screen_name", "c"."uid" AS "comment_uuid", "c"."id" AS "comment_id", "c"."body", "c"."created_at", "c"."updated_at" FROM "users" AS "u" INNER JOIN "comments" AS "c" ON "c"."user_id" = "u"."uid" WHERE "c"."post_id" = ? AND "c"."hide_type" = 0',
        [postUuid],
      );
      const cPromises = comments.rows.map(async (comment) => {
        const userId = `urn:uuid:${comment.uid}`;
        const commentId = comment.comment_id;
        const commentResourceId = `urn:uuid:${comment.comment_uuid}`;

        await addQuad(hasComment(postResourceId, commentResourceId));
        await addQuad(schemaType(commentResourceId, 'Comment'));
        await addQuad(hasAuthor(commentResourceId, userId));
        await addQuad(hasText(commentResourceId, comment.body));
        await addQuad(createdAt(commentResourceId, fixIso(comment.created_at)));
        await addQuad(updatedAt(commentResourceId, fixIso(comment.updated_at)));

        Reflect.deleteProperty(comment, 'comment_id');
        Reflect.deleteProperty(comment, 'comment_uuid');
        Reflect.deleteProperty(comment, 'body');
        Reflect.deleteProperty(comment, 'created_at');
        Reflect.deleteProperty(comment, 'updated_at');
        otherUsers.add(comment);

        const cLikers = await knex.raw(
          'SELECT "u"."uid", "u"."username", "u"."screen_name", "l"."created_at" FROM "users" AS "u" INNER JOIN "comment_likes" AS "l" ON "l"."user_id" = "u"."id" WHERE "l"."comment_id" = ?',
          [commentId],
        );
        await addQuad(hasUpvoteCount(commentResourceId, cLikers.rows.length));

        const clPromises = cLikers.rows.map(async (cLiker) => {
          const clikerResourceId = `urn:uuid:${cLiker.uid}`;
          const clikeResourceId = `${frf}${comment.comment_uuid}/like/${cLiker.uid}`;

          await addQuad(schemaType(clikeResourceId, 'LikeAction'));
          await addQuad(actionAgent(clikeResourceId, clikerResourceId));
          await addQuad(actionObject(clikeResourceId, commentResourceId));
          await addQuad(actionStart(clikeResourceId, fixIso(cLiker.created_at)));

          Reflect.deleteProperty(cLiker, 'created_at');
          otherUsers.add(cLiker);
        });

        await Promise.all(clPromises);
      });

      return cPromises;
    };

    process.stdout.write(`- getting user's posts: `);

    {
      // User's posts
      const timeline = await user.getPostsTimeline();

      const sql = `SELECT * FROM "posts" WHERE "feed_ids" && '{${timeline.intId}}'`;
      const cursor = pg.query(new PgCursor(sql));
      const read = promisify(cursor.read).bind(cursor);

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const rows = await read(100);

        if (rows.length === 0) {
          cursor.close(noop);
          break;
        }

        process.stdout.write('.');

        for (const postRow of rows) {
          const postResourceId = `urn:uuid:${postRow.uid}`;

          await addQuad(hasBlogPost(blogId, postResourceId));
          await addQuad(schemaType(postResourceId, 'BlogPosting'));
          await addQuad(
            objUrl(postResourceId, `https://freefeed.net/${user.username}/${postRow.uid}`),
          );
          await addQuad(createdAt(postResourceId, fixIso(postRow.created_at)));
          await addQuad(updatedAt(postResourceId, fixIso(postRow.updated_at)));
          await addQuad(hasText(postResourceId, postRow.body));

          const likers = await knex.raw(
            'SELECT "u"."uid", "u"."username", "u"."screen_name", "l"."created_at" FROM "users" AS "u" INNER JOIN "likes" AS "l" ON "l"."user_id" = "u"."uid" WHERE "l"."post_id" = ?',
            [postRow.uid],
          );
          const lPromises = likers.rows.map(async (liker) => {
            const userId = `urn:uuid:${liker.uid}`;
            const likeId = `${frf}${postRow.uid}/like/${liker.uid}`;

            await addQuad(schemaType(likeId, 'LikeAction'));
            await addQuad(actionAgent(likeId, userId));
            await addQuad(actionObject(likeId, postResourceId));
            await addQuad(actionStart(likeId, fixIso(liker.created_at)));

            Reflect.deleteProperty(liker, 'created_at');
            otherUsers.add(liker);
          });

          const cPromises = await commentsAsQuads(postRow.uid, postResourceId);

          await Promise.all(lPromises); // likes
          await Promise.all(cPromises); // comments + comment-likes
        }
      }
    }

    process.stdout.write('\n');

    process.stdout.write(`- getting user's direct messages: `);

    {
      // Direct messages
      const timeline = await user.getDirectsTimeline();

      const sql = `SELECT * FROM "posts" WHERE "feed_ids" && '{${timeline.intId}}'`;
      const cursor = pg.query(new PgCursor(sql));
      const read = promisify(cursor.read).bind(cursor);

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const rows = await read(100);

        if (rows.length === 0) {
          cursor.close(noop);
          break;
        }

        process.stdout.write('.');

        for (const postRow of rows) {
          const postResourceId = `urn:uuid:${postRow.uid}`;

          let senderId = user.id;
          let sender = blogId;
          let postUrl = `https://freefeed.net/${user.username}/${postRow.uid}`;

          if (postRow.user_id !== userUuid) {
            const authorRows = await knex.raw(
              'SELECT "u"."uid", "u"."username", "u"."screen_name" FROM "users" AS "u" WHERE "u"."uid" = ?',
              [postRow.user_id],
            );
            const [author] = authorRows.rows;

            senderId = author.uid;
            sender = `urn:uuid:${author.uid}`;
            postUrl = `https://freefeed.net/${author.username}/${postRow.uid}`;

            otherUsers.add(author);
          }

          await addQuad(schemaType(postResourceId, 'Message'));
          await addQuad(messageSender(postResourceId, sender));
          await addQuad(objUrl(postResourceId, postUrl));
          await addQuad(createdAt(postResourceId, fixIso(postRow.created_at)));
          await addQuad(updatedAt(postResourceId, fixIso(postRow.updated_at)));
          await addQuad(hasText(postResourceId, postRow.body));

          const recipientSql = pgFormat(
            'SELECT "u"."uid", "u"."username", "u"."screen_name" FROM "users" AS "u" inner join feeds f on f.user_id = u.uid where f.id in (%L)',
            postRow.destination_feed_ids,
          );
          const recipientResult = await knex.raw(recipientSql);
          const rPromises = recipientResult.rows.map(async (recipient) => {
            if (recipient.uid === senderId) {
              return;
            }

            const recipientUrl = `urn:uuid:${recipient.uid}`;
            await addQuad(messageRecipient(postResourceId, recipientUrl));

            otherUsers.add(recipient);
          });

          const likers = await knex.raw(
            'SELECT "u"."uid", "u"."username", "u"."screen_name", "l"."created_at" FROM "users" AS "u" INNER JOIN "likes" AS "l" ON "l"."user_id" = "u"."uid" WHERE "l"."post_id" = ?',
            [postRow.uid],
          );
          const lPromises = likers.rows.map(async (liker) => {
            const userId = `urn:uuid:${liker.uid}`;
            const likeId = `${frf}${postRow.uid}/like/${liker.uid}`;

            await addQuad(schemaType(likeId, 'LikeAction'));
            await addQuad(actionAgent(likeId, userId));
            await addQuad(actionObject(likeId, postResourceId));
            await addQuad(actionStart(likeId, fixIso(liker.created_at)));

            Reflect.deleteProperty(liker, 'created_at');
            otherUsers.add(liker);
          });

          const cPromises = await commentsAsQuads(postRow.uid, postResourceId);

          await Promise.all(rPromises); // recipients
          await Promise.all(lPromises); // likes
          await Promise.all(cPromises); // comments + comment-likes
        }
      }
    }

    process.stdout.write('\n');

    const downloadUrls = [];
    process.stdout.write(`- getting user's attachments: `);

    {
      const attachmentTypes = {
        audio: 'AudioObject',
        general: 'DataDownload',
        image: 'ImageObject',
      };

      const sql = `SELECT * FROM "attachments" WHERE "user_id" = $1`; // using '$1' instead of '?' as we're VERY close to postgres in this call
      const cursor = pg.query(new PgCursor(sql, [user.id]));
      const read = promisify(cursor.read).bind(cursor);

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const rows = await read(100);

        if (rows.length === 0) {
          cursor.close(noop);
          break;
        }

        process.stdout.write('.');

        for (const attachmentRow of rows) {
          if (attachmentRow.media_type === null) {
            // skip bogus attachments
            continue;
          }

          const attResourceId = `urn:uuid:${attachmentRow.uid}`;

          let downloadUrl = `${config.attachments.url}${config.attachments.path}${attachmentRow.uid}`;

          if (attachmentRow.file_extension) {
            downloadUrl = `${downloadUrl}.${attachmentRow.file_extension}`;
          }

          downloadUrls.push(downloadUrl);

          await addQuad(schemaType(attResourceId, attachmentTypes[attachmentRow.media_type]));
          await addQuad(createdAt(attResourceId, fixIso(attachmentRow.created_at)));
          await addQuad(updatedAt(attResourceId, fixIso(attachmentRow.updated_at)));
          await addQuad(objUrl(attResourceId, downloadUrl));
          await addQuad(hasFilename(attResourceId, attachmentRow.file_name));

          if (attachmentRow.mime_type) {
            await addQuad(hasMimetype(attResourceId, attachmentRow.mime_type));
          }

          if (attachmentRow.post_id) {
            // some attachments are not connected to posts
            const postResourceId = `urn:uuid:${attachmentRow.post_id}`;
            await addQuad(hasAttachment(postResourceId, attResourceId));
          }
        }
      }
    }

    process.stdout.write('\n');

    process.stdout.write(`- storing additional user-resources\n`);

    for (const otherUser of [...otherUsers]) {
      const userId = `urn:uuid:${otherUser.uid}`;

      await addQuad(schemaType(userId, 'Blog'));
      await addQuad(objIdentifier(userId, otherUser.username));
      await addQuad(objName(userId, otherUser.screen_name));
    }

    knex.client.releaseConnection(pg);
    const ntriples = await getResult();

    return { ntriples, downloadUrls };
  }
}

/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';
import { sortBy } from 'lodash';

import { User, Post, Group, dbAdapter, Comment } from '../../../../app/models';
import cleanDB from '../../../dbCleaner';
import { createPost } from '../../helpers/posts-and-comments';

describe('EventService', () => {
  describe('Backlinks', () => {
    before(() => cleanDB($pg_database));

    // There are users and every user has a post

    let /** @type {User} */ luna, /** @type {User} */ mars, /** @type {User} */ venus;
    let /** @type {Group} */ dubhe;
    let /** @type {Post} */ lunaPost, /** @type {Post} */ marsPost, /** @type {Post} */ venusPost;
    let marsPostShortId, venusPostShortId;

    before(async () => {
      luna = new User({ username: 'luna', password: 'pw' });
      mars = new User({ username: 'mars', password: 'pw' });
      venus = new User({ username: 'venus', password: 'pw' });

      dubhe = new Group({ username: 'dubhe' });

      await Promise.all([luna, mars, venus].map((u) => u.create()));
      await dubhe.create(luna.id);

      [lunaPost, marsPost, venusPost] = await Promise.all(
        [luna, mars, venus].map((u) => createPost(u, `${u.username} post`)),
      );

      marsPostShortId = await marsPost.getShortId();
      venusPostShortId = await venusPost.getShortId();
    });

    // Clean events before each test
    beforeEach(() => dbAdapter.database.raw(`delete from events`));

    describe('Links to posts', () => {
      describe('Links to posts in posts', () => {
        let post;
        afterEach(() => post.destroy());

        it('should create backlink_in_post event for mentioned posts author', async () => {
          post = await createPost(luna, `Mentioning ${marsPost.id}`);
          await expectBacklinkEvents(mars, [await backlinkInPostEvent(post, marsPost)]);
          await expectBacklinkEvents(luna, []);
        });

        it('should create backlink_in_post event for mentioned posts author (short link)', async () => {
          post = await createPost(luna, `Mentioning /mars/${marsPostShortId}`);
          await expectBacklinkEvents(mars, [await backlinkInPostEvent(post, marsPost)]);
          await expectBacklinkEvents(luna, []);
        });

        it('should not create backlink_in_post event for mentioned post author', async () => {
          post = await createPost(luna, `Mentioning ${lunaPost.id}`);
          await expectBacklinkEvents(luna, []);
        });

        it('should create backlink_in_post event for each mentioned post', async () => {
          post = await createPost(luna, `Mentioning /mars/${marsPostShortId} ${venusPost.id}`);
          await expectBacklinkEvents(mars, [await backlinkInPostEvent(post, marsPost)]);
          await expectBacklinkEvents(venus, [await backlinkInPostEvent(post, venusPost)]);
          await expectBacklinkEvents(luna, []);
        });

        it('should create backlink_in_post event with proper group_id for post in group', async () => {
          post = await createPost(luna, `Mentioning ${marsPost.id}`, [dubhe]);
          await expectBacklinkEvents(mars, [await backlinkInPostEvent(post, marsPost)]);
        });

        it('should not create backlink_in_post event for mentioned user who banned post author', async () => {
          await mars.ban(luna.username);
          post = await createPost(luna, `Mentioning ${marsPost.id}`);
          await expectBacklinkEvents(mars, []);
          await mars.unban(luna.username);
        });

        it('should not create backlink_in_post event for banned mentioned user', async () => {
          await luna.ban(mars.username);
          post = await createPost(luna, `Mentioning ${marsPost.id}`);
          await expectBacklinkEvents(mars, []);
          await luna.unban(mars.username);
        });

        it('should not create backlink_in_post event for user who was mentioned in private post of non-friend', async () => {
          await luna.update({ isPrivate: '1', isProtected: '1' });
          post = await createPost(luna, `Mentioning ${marsPost.id}`);
          await expectBacklinkEvents(mars, []);
          await luna.update({ isPrivate: '0', isProtected: '0' });
        });

        it('should create backlink_in_post event for user who was mentioned in private post of friend', async () => {
          await mars.subscribeTo(luna);
          await luna.update({ isPrivate: '1', isProtected: '1' });
          post = await createPost(luna, `Mentioning ${marsPost.id}`);
          await expectBacklinkEvents(mars, [await backlinkInPostEvent(post, marsPost)]);
          await luna.update({ isPrivate: '0', isProtected: '0' });
          await mars.unsubscribeFrom(luna);
        });

        it('should create only one backlink_in_post event for mentioned user for one post', async () => {
          post = await createPost(luna, `Mentioning ${marsPost.id} ${marsPost.id} ${marsPost.id}`);
          await expectBacklinkEvents(mars, [await backlinkInPostEvent(post, marsPost)]);
        });

        describe('When post updates', () => {
          it('should create backlink_in_post when post without mention updates with mention', async () => {
            post = await createAndUpdatePost(
              luna,
              'Post without mentions',
              `Mentioning ${marsPost.id}`,
            );

            await expectBacklinkEvents(mars, [await backlinkInPostEvent(post, marsPost)]);
          });

          it('should create backlink_in_post when post without mention updates with mention (short link)', async () => {
            post = await createAndUpdatePost(
              luna,
              'Post without mentions',
              `Mentioning /mars/${marsPostShortId}`,
            );

            await expectBacklinkEvents(mars, [await backlinkInPostEvent(post, marsPost)]);
          });

          it('should not remove backlink_in_post when mention disappears from the post', async () => {
            post = await createAndUpdatePost(
              luna,
              `Mentioning ${marsPost.id}`,
              'Post without mentions',
            );
            await expectBacklinkEvents(mars, [await backlinkInPostEvent(post, marsPost)]);
          });

          it('should create additional backlink_in_post when a new mention appears in the post', async () => {
            post = await createAndUpdatePost(
              luna,
              `Mentioning ${venusPost.id}`,
              `Mentioning /mars/${marsPostShortId}`,
            );
            await expectBacklinkEvents(mars, [await backlinkInPostEvent(post, marsPost)]);
            await expectBacklinkEvents(venus, [await backlinkInPostEvent(post, venusPost)]);
          });
        });
      });

      describe('Links to posts in comments', () => {
        let comment;
        afterEach(() => comment.destroy());

        it('should create backlink_in_comment event for mentioned posts author', async () => {
          comment = await createComment(luna, venusPost, `Mentioning ${marsPost.id}`);
          await expectBacklinkEvents(mars, [await backlinkInCommentEvent(comment, marsPost)]);
          await expectBacklinkEvents(luna, []);
        });

        it('should create backlink_in_comment event for mentioned posts author (short link)', async () => {
          comment = await createComment(luna, venusPost, `Mentioning /mars/${marsPostShortId}`);
          await expectBacklinkEvents(mars, [await backlinkInCommentEvent(comment, marsPost)]);
          await expectBacklinkEvents(luna, []);
        });

        it('should not create backlink_in_comment event for mentioned post author', async () => {
          comment = await createComment(luna, venusPost, `Mentioning ${lunaPost.id}`);
          await expectBacklinkEvents(luna, []);
        });

        it('should create backlink_in_comment event for each mentioned post', async () => {
          comment = await createComment(
            luna,
            venusPost,
            `Mentioning /mars/${marsPostShortId} ${venusPost.id}`,
          );
          await expectBacklinkEvents(mars, [await backlinkInCommentEvent(comment, marsPost)]);
          await expectBacklinkEvents(venus, [await backlinkInCommentEvent(comment, venusPost)]);
          await expectBacklinkEvents(luna, []);
        });

        it('should not create backlink_in_comment event for mentioned user who banned post author', async () => {
          await mars.ban(luna.username);
          comment = await createComment(luna, venusPost, `Mentioning ${marsPost.id}`);
          await expectBacklinkEvents(mars, []);
          await mars.unban(luna.username);
        });

        it('should create (!) backlink_in_comment event for banned mentioned user', async () => {
          await luna.ban(mars.username);
          comment = await createComment(luna, venusPost, `Mentioning ${marsPost.id}`);
          await expectBacklinkEvents(mars, [await backlinkInCommentEvent(comment, marsPost)]);
          await luna.unban(mars.username);
        });

        it('should not create backlink_in_comment event for user who was mentioned in private post of non-friend', async () => {
          await venus.update({ isPrivate: '1', isProtected: '1' });
          comment = await createComment(luna, venusPost, `Mentioning ${marsPost.id}`);
          await expectBacklinkEvents(mars, []);
          await venus.update({ isPrivate: '0', isProtected: '0' });
        });

        it('should create backlink_in_comment event for user who was mentioned in private post of friend', async () => {
          await mars.subscribeTo(venus);
          await venus.update({ isPrivate: '1', isProtected: '1' });
          comment = await createComment(luna, venusPost, `Mentioning ${marsPost.id}`);
          await expectBacklinkEvents(mars, [await backlinkInCommentEvent(comment, marsPost)]);
          await venus.update({ isPrivate: '0', isProtected: '0' });
          await mars.unsubscribeFrom(venus);
        });

        it('should create only one backlink_in_comment event for mentioned user for one post', async () => {
          comment = await createComment(
            luna,
            venusPost,
            `Mentioning ${marsPost.id} ${marsPost.id} ${marsPost.id}`,
          );
          await expectBacklinkEvents(mars, [await backlinkInCommentEvent(comment, marsPost)]);
        });

        describe('When comment updates', () => {
          it('should create backlink_in_post when post without mention updates with mention', async () => {
            comment = await createComment(
              luna,
              venusPost,
              'Post without mentions',
              `Mentioning ${marsPost.id}`,
            );

            await expectBacklinkEvents(mars, [await backlinkInCommentEvent(comment, marsPost)]);
          });

          it('should create backlink_in_post when post without mention updates with mention (short link)', async () => {
            comment = await createComment(
              luna,
              venusPost,
              'Post without mentions',
              `Mentioning /mars/${marsPostShortId}`,
            );

            await expectBacklinkEvents(mars, [await backlinkInCommentEvent(comment, marsPost)]);
          });

          it('should not remove backlink_in_post when mention disappears from the post', async () => {
            comment = await createComment(
              luna,
              venusPost,
              `Mentioning ${marsPost.id}`,
              'Post without mentions',
            );
            await expectBacklinkEvents(mars, [await backlinkInCommentEvent(comment, marsPost)]);
          });

          it('should create additional backlink_in_post when a new mention appears in the post', async () => {
            comment = await createComment(
              luna,
              venusPost,
              `Mentioning ${venusPost.id}`,
              `Mentioning /mars/${marsPostShortId}`,
            );
            await expectBacklinkEvents(mars, [await backlinkInCommentEvent(comment, marsPost)]);
            await expectBacklinkEvents(venus, [await backlinkInCommentEvent(comment, venusPost)]);
          });
        });
      });
    });

    describe('Links to comments', () => {
      let lunaComment, marsComment, venusComment;
      before(async () => {
        [lunaComment, marsComment, venusComment] = await Promise.all(
          [luna, mars, venus].map((a) => createComment(a, venusPost, 'A comment')),
        );
      });
      after(() => Promise.all([lunaComment, marsComment, venusComment].map((c) => c.destroy())));

      describe('Links to comments in posts', () => {
        let post;
        afterEach(() => post.destroy());

        it('should create backlink_in_post event for mentioned comment author', async () => {
          post = await createPost(luna, `Mentioning ${marsComment.id}`);
          await expectBacklinkEvents(mars, [await backlinkInPostEvent(post, marsComment)]);
          await expectBacklinkEvents(luna, []);
        });

        it('should create backlink_in_post event for mentioned comment author (short link)', async () => {
          post = await createPost(
            luna,
            `Mentioning /venus/${venusPostShortId}#${marsComment.shortId}`,
          );
          await expectBacklinkEvents(mars, [await backlinkInPostEvent(post, marsComment)]);
          await expectBacklinkEvents(venus, [await backlinkInPostEvent(post, venusPost)]);
          await expectBacklinkEvents(luna, []);
        });

        it('should not create backlink_in_post event for mentioned comment author', async () => {
          post = await createPost(luna, `Mentioning ${lunaComment.id}`);
          await expectBacklinkEvents(luna, []);
        });

        it('should create backlink_in_post event for each mentioned comment', async () => {
          post = await createPost(
            luna,
            `Mentioning /venus/${venusPostShortId}#${marsComment.shortId} ${venusComment.id}`,
          );
          await expectBacklinkEvents(mars, [await backlinkInPostEvent(post, marsComment)]);
          await expectBacklinkEvents(venus, [
            await backlinkInPostEvent(post, venusPost),
            await backlinkInPostEvent(post, venusComment),
          ]);
          await expectBacklinkEvents(luna, []);
        });

        it('should create backlink_in_post event with proper group_id for post in group', async () => {
          post = await createPost(luna, `Mentioning ${marsComment.id}`, [dubhe]);
          await expectBacklinkEvents(mars, [await backlinkInPostEvent(post, marsComment)]);
        });

        it('should not create backlink_in_post event for mentioned user who banned post author', async () => {
          await mars.ban(luna.username);
          post = await createPost(luna, `Mentioning ${marsComment.id}`);
          await expectBacklinkEvents(mars, []);
          await mars.unban(luna.username);
        });

        it('should not create backlink_in_post event for banned mentioned user', async () => {
          await luna.ban(mars.username);
          post = await createPost(luna, `Mentioning ${marsComment.id}`);
          await expectBacklinkEvents(mars, []);
          await luna.unban(mars.username);
        });

        it('should not create backlink_in_post event for user who was mentioned in private post of non-friend', async () => {
          await luna.update({ isPrivate: '1', isProtected: '1' });
          post = await createPost(luna, `Mentioning ${marsComment.id}`);
          await expectBacklinkEvents(mars, []);
          await luna.update({ isPrivate: '0', isProtected: '0' });
        });

        it('should create backlink_in_post event for user who was mentioned in private post of friend', async () => {
          await mars.subscribeTo(luna);
          await luna.update({ isPrivate: '1', isProtected: '1' });
          post = await createPost(luna, `Mentioning ${marsComment.id}`);
          await expectBacklinkEvents(mars, [await backlinkInPostEvent(post, marsComment)]);
          await luna.update({ isPrivate: '0', isProtected: '0' });
          await mars.unsubscribeFrom(luna);
        });

        it('should create only one backlink_in_post event for mentioned user for one post', async () => {
          post = await createPost(
            luna,
            `Mentioning ${marsComment.id} ${marsComment.id} ${marsComment.id}`,
          );
          await expectBacklinkEvents(mars, [await backlinkInPostEvent(post, marsComment)]);
        });

        describe('When post updates', () => {
          it('should create backlink_in_post when post without mention updates with mention', async () => {
            post = await createAndUpdatePost(
              luna,
              'Post without mentions',
              `Mentioning ${marsComment.id}`,
            );

            await expectBacklinkEvents(mars, [await backlinkInPostEvent(post, marsComment)]);
          });

          it('should create backlink_in_post when post without mention updates with mention (short link)', async () => {
            post = await createAndUpdatePost(
              luna,
              'Post without mentions',
              `Mentioning /venus/${venusPostShortId}#${marsComment.shortId}`,
            );

            await expectBacklinkEvents(mars, [await backlinkInPostEvent(post, marsComment)]);
            await expectBacklinkEvents(venus, [await backlinkInPostEvent(post, venusPost)]);
          });

          it('should not remove backlink_in_post when mention disappears from the post', async () => {
            post = await createAndUpdatePost(
              luna,
              `Mentioning ${marsComment.id}`,
              'Post without mentions',
            );
            await expectBacklinkEvents(mars, [await backlinkInPostEvent(post, marsComment)]);
          });

          it('should create additional backlink_in_post when a new mention appears in the post', async () => {
            post = await createAndUpdatePost(
              luna,
              `Mentioning ${venusComment.id}`,
              `Mentioning /venus/${venusPostShortId}#${marsComment.shortId}`,
            );
            await expectBacklinkEvents(mars, [await backlinkInPostEvent(post, marsComment)]);
            await expectBacklinkEvents(venus, [
              await backlinkInPostEvent(post, venusPost),
              await backlinkInPostEvent(post, venusComment),
            ]);
          });
        });
      });

      describe('Links to comments in comments', () => {
        let comment;
        afterEach(() => comment.destroy());

        it('should create backlink_in_comment event for mentioned comment author', async () => {
          comment = await createComment(luna, venusPost, `Mentioning ${marsComment.id}`);
          await expectBacklinkEvents(mars, [await backlinkInCommentEvent(comment, marsComment)]);
          await expectBacklinkEvents(luna, []);
        });

        it('should create backlink_in_comment event for mentioned comment author (short link)', async () => {
          comment = await createComment(
            luna,
            venusPost,
            `Mentioning /venus/${venusPostShortId}#${marsComment.shortId}`,
          );
          await expectBacklinkEvents(mars, [await backlinkInCommentEvent(comment, marsComment)]);
          await expectBacklinkEvents(venus, [await backlinkInCommentEvent(comment, venusPost)]);
          await expectBacklinkEvents(luna, []);
        });

        it('should not create backlink_in_comment event for mentioned comment author', async () => {
          comment = await createComment(luna, venusPost, `Mentioning ${lunaComment.id}`);
          await expectBacklinkEvents(luna, []);
        });

        it('should create backlink_in_comment event for each mentioned comment', async () => {
          comment = await createComment(
            luna,
            venusPost,
            `Mentioning /venus/${venusPostShortId}#${marsComment.shortId} ${venusComment.id}`,
          );
          await expectBacklinkEvents(mars, [await backlinkInCommentEvent(comment, marsComment)]);
          await expectBacklinkEvents(venus, [
            await backlinkInCommentEvent(comment, venusPost),
            await backlinkInCommentEvent(comment, venusComment),
          ]);
          await expectBacklinkEvents(luna, []);
        });

        it('should not create backlink_in_comment event for mentioned user who banned comment author', async () => {
          await mars.ban(luna.username);
          comment = await createComment(luna, venusPost, `Mentioning ${marsComment.id}`);
          await expectBacklinkEvents(mars, []);
          await mars.unban(luna.username);
        });

        it('should create (!) backlink_in_comment event for banned mentioned user', async () => {
          await luna.ban(mars.username);
          comment = await createComment(luna, venusPost, `Mentioning ${marsComment.id}`);
          await expectBacklinkEvents(mars, [await backlinkInCommentEvent(comment, marsComment)]);
          await luna.unban(mars.username);
        });

        it('should not create backlink_in_comment event for user who was mentioned in private post of non-friend', async () => {
          await venus.update({ isPrivate: '1', isProtected: '1' });
          comment = await createComment(luna, venusPost, `Mentioning ${marsComment.id}`);
          await expectBacklinkEvents(mars, []);
          await venus.update({ isPrivate: '0', isProtected: '0' });
        });

        it('should create backlink_in_comment event for user who was mentioned in private post of friend', async () => {
          await mars.subscribeTo(venus);
          await venus.update({ isPrivate: '1', isProtected: '1' });
          comment = await createComment(luna, venusPost, `Mentioning ${marsComment.id}`);
          await expectBacklinkEvents(mars, [await backlinkInCommentEvent(comment, marsComment)]);
          await venus.update({ isPrivate: '0', isProtected: '0' });
          await mars.unsubscribeFrom(venus);
        });

        it('should create only one backlink_in_comment event for mentioned comment', async () => {
          comment = await createComment(
            luna,
            venusPost,
            `Mentioning ${marsComment.id} ${marsComment.id} ${marsComment.id}`,
          );
          await expectBacklinkEvents(mars, [await backlinkInCommentEvent(comment, marsComment)]);
        });

        describe('When comment updates', () => {
          it('should create backlink_in_post when comment without mention updates with mention', async () => {
            comment = await createComment(
              luna,
              venusPost,
              'Post without mentions',
              `Mentioning ${marsComment.id}`,
            );

            await expectBacklinkEvents(mars, [await backlinkInCommentEvent(comment, marsComment)]);
          });

          it('should create backlink_in_post when comment without mention updates with mention (short link)', async () => {
            comment = await createComment(
              luna,
              venusPost,
              'Post without mentions',
              `Mentioning /venus/${venusPostShortId}#${marsComment.shortId}`,
            );

            await expectBacklinkEvents(mars, [await backlinkInCommentEvent(comment, marsComment)]);
          });

          it('should not remove backlink_in_post when mention disappears from the comment', async () => {
            comment = await createComment(
              luna,
              venusPost,
              `Mentioning ${marsComment.id}`,
              'Post without mentions',
            );
            await expectBacklinkEvents(mars, [await backlinkInCommentEvent(comment, marsComment)]);
          });

          it('should create additional backlink_in_post when a new mention appears in the comment', async () => {
            comment = await createComment(
              luna,
              venusPost,
              `Mentioning ${venusComment.id}`,
              `Mentioning /venus/${venusPostShortId}#${marsComment.shortId}`,
            );
            await expectBacklinkEvents(mars, [await backlinkInCommentEvent(comment, marsComment)]);
            await expectBacklinkEvents(venus, [
              await backlinkInCommentEvent(comment, venusPost),
              await backlinkInCommentEvent(comment, venusComment),
            ]);
          });
        });
      });
    });
  });
});

/**
 *
 * @param {User} author
 * @param {Post} post
 * @param {string} body
 * @param {string|null} nextBody
 */
async function createComment(author, post, body, nextBody = null) {
  const comment = author.newComment({ body, postId: post.id });
  await comment.create();

  if (nextBody !== null) {
    await comment.update({ body: nextBody });
  }

  return comment;
}

/**
 * @param {User} user
 * @param {Object[]} shape
 */
async function expectBacklinkEvents(user, shape) {
  const events = await dbAdapter.getUserEvents(user.intId, [
    'backlink_in_post',
    'backlink_in_comment',
  ]);

  // If array `shape` has more than one element, it's prone to race conditions
  // (as `events` may go in random order, not matching the order in `shape`).
  // So we need to sort both to make the comparison deterministic.
  if (shape.length > 1) {
    const events2 = sortBy(events, Object.keys(shape[0]));
    const shape2 = sortBy(shape, Object.keys(shape[0]));
    expect(events2, 'to satisfy', shape2);
  } else {
    expect(events, 'to satisfy', shape);
  }
}

/**
 * @param {Post} post
 * @param {Post|Comment} mentionedEntity
 */
async function backlinkInPostEvent(post, mentionedEntity) {
  const [initiator, receiver, groups, targetPost] = await Promise.all([
    post.getCreatedBy(),
    mentionedEntity.getCreatedBy(),
    post.getGroupsPostedTo(),
    mentionedEntity instanceof Post ? mentionedEntity : mentionedEntity.getPost(),
  ]);
  return {
    user_id: receiver.intId,
    event_type: 'backlink_in_post',
    post_id: post.intId,
    group_id: groups[0]?.intId || null,
    created_by_user_id: initiator.intId,
    target_user_id: receiver.intId,
    post_author_id: initiator.intId,
    target_post_id: targetPost?.id || null,
    target_comment_id: mentionedEntity instanceof Comment ? mentionedEntity.id : null,
  };
}

/**
 * @param {Comment} post
 * @param {Post|Comment} mentionedEntity
 */
async function backlinkInCommentEvent(comment, mentionedEntity) {
  const post = await comment.getPost();
  const [initiator, postAuthor, receiver, groups, targetPost] = await Promise.all([
    comment.getCreatedBy(),
    post.getCreatedBy(),
    mentionedEntity.getCreatedBy(),
    post.getGroupsPostedTo(),
    mentionedEntity instanceof Post ? mentionedEntity : mentionedEntity.getPost(),
  ]);
  return {
    user_id: receiver.intId,
    event_type: 'backlink_in_comment',
    post_id: post.intId,
    comment_id: comment.intId,
    group_id: groups[0]?.intId || null,
    created_by_user_id: initiator.intId,
    target_user_id: receiver.intId,
    post_author_id: postAuthor.intId,
    target_post_id: targetPost?.id || null,
    target_comment_id: mentionedEntity instanceof Comment ? mentionedEntity.id : null,
  };
}

async function createAndUpdatePost(author, initialBody, nextBody) {
  const timelineIds = await Promise.all([author].map((d) => d.getPostsTimelineId()));
  const p = new Post({ userId: author.id, body: initialBody, timelineIds });
  await p.create();
  await p.update({ body: nextBody });
  return p;
}

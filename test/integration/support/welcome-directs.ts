import { beforeEach, describe, it } from 'mocha';
import unexpected from 'unexpected';
import unexpectedDate from 'unexpected-date';
import { DateTime, Duration } from 'luxon';

import { dbAdapter, Job, Post, User } from '../../../app/models';
import cleanDB from '../../dbCleaner';
import { createUsers } from '../helpers/users';
import { withModifiedConfig } from '../../helpers/with-modified-config';
import {
  jobHandler,
  scheduleWelcomeDirects,
  WELCOME_DIRECT,
} from '../../../app/support/welcome-directs';
import type { JobPayload } from '../../../app/support/welcome-directs';
import { createPost } from '../helpers/posts-and-comments';

const expect = unexpected.clone().use(unexpectedDate);

describe('Welcome Directs', () => {
  beforeEach(() => cleanDB(dbAdapter.database));

  let welcome: User;
  let luna: User;

  beforeEach(async () => {
    [welcome, luna] = await createUsers(['welcome', 'luna']);
  });

  withModifiedConfig({ ianaTimeZone: 'UTC' });

  it('should schedule welcome directs', async () => {
    const [ok, now] = await Promise.all([scheduleWelcomeDirects(luna), dbAdapter.now()]);
    expect(ok, 'to be', true);

    const jobs = await dbAdapter.getAllJobs([WELCOME_DIRECT]);
    expect(jobs, 'to have an item satisfying', {
      unlockAt: expect.it('to be close to', now),
      payload: {
        id: 'greeting_at_start',
        userId: luna.id,
        senderId: welcome.id,
      },
    });
    expect(jobs, 'to have an item satisfying', {
      unlockAt: expect.it(
        'to be close to',
        DateTime.fromJSDate(now).setZone('UTC').plus(Duration.fromISO('PT10M')).toJSDate(),
      ),
      payload: {
        id: 'no_posts',
        userId: luna.id,
        senderId: welcome.id,
      },
    });
    expect(jobs, 'to have an item satisfying', {
      unlockAt: expect.it(
        'to be close to',
        DateTime.fromJSDate(now)
          .setZone('UTC')
          .plus({ days: 1 })
          .startOf('day')
          .plus(Duration.fromISO('PT10H'))
          .toJSDate(),
      ),
      payload: {
        id: 'no_subscriptions',
        userId: luna.id,
        senderId: welcome.id,
      },
    });
  });

  describe('Directs creation', () => {
    let jobs: Job<JobPayload>[];

    beforeEach(async () => {
      await scheduleWelcomeDirects(luna);
      jobs = await dbAdapter.getAllJobs<JobPayload>([WELCOME_DIRECT]);
    });

    it('should create all direct messages', async () => {
      // 'greeting_at_start'
      {
        const job = jobs.find((j) => j.payload.id === 'greeting_at_start');
        expect(job, 'not to be', null);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await jobHandler(job!);

        const posts = await getDirectPosts(luna);
        expect(posts, 'to have length', 1);
        expect(posts[0], 'to satisfy', {
          body: 'Hi and welcome to FreeFeed! I am a welcome bot and this is your personal welcome message.',
          userId: welcome.id,
          commentsDisabled: '1',
        });

        // Check comment
        const comments = await posts[0].getComments();
        expect(comments, 'to have length', 1);
        expect(comments[0], 'to satisfy', {
          body: 'Please ask in @support group for help',
          userId: welcome.id,
        });
      }

      // no_posts
      {
        const job = jobs.find((j) => j.payload.id === 'no_posts');
        expect(job, 'not to be', null);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await jobHandler(job!);

        const posts = await getDirectPosts(luna);
        expect(posts, 'to have length', 2);
        expect(posts[0], 'to satisfy', {
          body: "Hello again, I see you haven't created any posts in the last 10 minutes!",
          userId: welcome.id,
          commentsDisabled: '1',
        });

        // Check comment
        const comments = await posts[0].getComments();
        expect(comments, 'to have length', 1);
        expect(comments[0], 'to satisfy', {
          body: "Don't worry, you can create posts at any time.",
          userId: welcome.id,
        });
      }

      // no_subscriptions
      {
        const job = jobs.find((j) => j.payload.id === 'no_subscriptions');
        expect(job, 'not to be', null);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await jobHandler(job!);

        const posts = await getDirectPosts(luna);
        expect(posts, 'to have length', 3);
        expect(posts[0], 'to satisfy', {
          body: "Hi, I see you haven't subscribed to anyone yet.",
          userId: welcome.id,
          commentsDisabled: '1',
        });

        // Check comment
        const comments = await posts[0].getComments();
        expect(comments, 'to have length', 0);
      }
    });

    describe('Luna created a post', () => {
      beforeEach(() => createPost(luna, 'Luna post'));

      it("should not create a 'no_posts' direct for Luna", async () => {
        await Promise.all(jobs.map((job) => jobHandler(job)));
        const posts = await getDirectPosts(luna);

        expect(posts, 'to have length', 2);

        expect(posts, 'not to have an item satisfying', {
          body: "Hello again, I see you haven't created any posts in the last 10 minutes!",
        });
      });
    });

    describe('Luna got many friends', () => {
      beforeEach(async () => {
        const friends = await createUsers(['friend1', 'friend2', 'friend3', 'friend4', 'friend5']);
        await Promise.all(friends.map((f) => luna.subscribeTo(f)));
      });

      it("should not create a 'no_subscriptions' direct for Luna", async () => {
        await Promise.all(jobs.map((job) => jobHandler(job)));
        const posts = await getDirectPosts(luna);

        expect(posts, 'to have length', 2);

        expect(posts, 'not to have an item satisfying', {
          body: "Hi, I see you haven't subscribed to anyone yet.",
        });
      });
    });
  });
});

async function getDirectPosts(user: User): Promise<Post[]> {
  const feed = await user.getDirectsTimeline();

  if (!feed) {
    return [];
  }

  const { intId } = feed;
  const postIds = await dbAdapter.getTimelinePostsIds([intId], user.id, { authorsIds: [] });
  return await dbAdapter.getPostsByIds(postIds);
}

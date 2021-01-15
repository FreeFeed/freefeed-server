/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../dbCleaner';

import * as helper from './functional_test_helper';

describe('Local bumps', () => {
  beforeEach(() => cleanDB($pg_database));

  describe('Luna, Mars and stranger Jupiter', () => {
    let luna,
      mars,
      jupiter,
      celestials,
      lunaPosts,
      marsPosts,
      marsPostsInGroup,
      lunaDefaultHomefeed,
      marsDefaultHomefeed,
      groupDefaultFeed;

    const createPosts = async () => {
      const nPosts = 3;

      // Mars posts
      marsPosts = [];

      for (let i = 0; i < nPosts; i++) {
        const { id } = await helper.createAndReturnPost(mars, 'post'); // eslint-disable-line no-await-in-loop
        marsPosts.push(id);
      }

      marsDefaultHomefeed = [...marsPosts].reverse();

      // Luna posts
      lunaPosts = [];

      for (let i = 0; i < nPosts; i++) {
        const { id } = await helper.createAndReturnPost(luna, 'post'); // eslint-disable-line no-await-in-loop
        lunaPosts.push(id);
      }

      lunaDefaultHomefeed = [...lunaPosts].reverse();
    };

    const createPostsInGroup = async () => {
      const nPosts = 3;

      // Mars posts in group
      marsPostsInGroup = [];

      for (let i = 0; i < nPosts; i++) {
        const { id } = await helper.createAndReturnPostToFeed(celestials, mars, 'post'); // eslint-disable-line no-await-in-loop
        marsPostsInGroup.push(id);
      }

      groupDefaultFeed = [...marsPostsInGroup].reverse();
    };

    beforeEach(async () => {
      [luna, mars, jupiter] = await helper.createTestUsers(3);
    });

    describe('Luna and Mars created posts, then Luna subscribed to Jupiter', () => {
      beforeEach(async () => {
        await createPosts();
        await helper.subscribeToAsync(luna, jupiter.user);
      });

      describe('Jupiter liked Mars post', () => {
        beforeEach(async () => {
          await like(jupiter, marsPosts[0]);
        });

        it("should bump liked post in the Luna's homefeed", async () => {
          await expectHomefeed(luna, bump(marsPosts[0], lunaDefaultHomefeed));
        });

        describe('Luna subscribes to Mars', () => {
          beforeEach(async () => {
            await helper.subscribeToAsync(luna, mars.user);
          });

          it("should keep liked post on the top of the Luna's homefeed", async () => {
            await expectHomefeed(
              luna,
              bump(marsPosts[0], [...lunaDefaultHomefeed, ...marsDefaultHomefeed]),
            );
          });
        });
      });

      describe('Luna liked Mars post', () => {
        beforeEach(async () => {
          await like(luna, marsPosts[0]);
        });

        it("should bump liked post in the Luna's homefeed", async () => {
          await expectHomefeed(luna, bump(marsPosts[0], lunaDefaultHomefeed));
        });

        describe('Luna subscribes to Mars', () => {
          beforeEach(async () => {
            await helper.subscribeToAsync(luna, mars.user);
          });

          it("should keep liked post on the top of the Luna's homefeed", async () => {
            await expectHomefeed(
              luna,
              bump(marsPosts[0], [...lunaDefaultHomefeed, ...marsDefaultHomefeed]),
            );
          });
        });
      });

      describe('Luna subscribed to Mars', () => {
        beforeEach(async () => {
          await helper.subscribeToAsync(luna, mars.user);
        });

        it("should receive Luna's homefeed in correct order", async () => {
          await expectHomefeed(luna, [...lunaDefaultHomefeed, ...marsDefaultHomefeed]);
        });

        describe('Jupiter likes Mars post', () => {
          beforeEach(async () => {
            await like(jupiter, marsPosts[0]);
          });

          it("should not bump liked post in the Luna's homefeed", async () => {
            await expectHomefeed(luna, [...lunaDefaultHomefeed, ...marsDefaultHomefeed]);
          });

          describe('Luna unsubscribed from Mars', () => {
            beforeEach(async () => {
              await helper.unsubscribeFromAsync(luna, mars.user);
            });

            it("should not bump liked post in the Luna's homefeed", async () => {
              await expectHomefeed(luna, [...lunaDefaultHomefeed, marsPosts[0]]);
            });
          });
        });
      });

      describe('Mars created Celestials group and wrote group posts', () => {
        beforeEach(async () => {
          celestials = await helper.createGroupAsync(mars, 'celestials');
          await createPostsInGroup();
        });

        describe('Jupiter liked Mars post in group', () => {
          beforeEach(async () => {
            await like(jupiter, marsPostsInGroup[0]);
          });

          it("should not bump liked post in the Luna's homefeed", async () => {
            await expectHomefeed(luna, lunaDefaultHomefeed);
          });

          describe('Luna joied group', () => {
            beforeEach(async () => {
              await helper.subscribeToAsync(luna, celestials);
            });

            it("should bump liked post in the Luna's homefeed", async () => {
              await expectHomefeed(
                luna,
                bump(marsPostsInGroup[0], [...groupDefaultFeed, ...lunaDefaultHomefeed]),
              );
            });
          });
        });
      });
    });
  });
});

async function expectHomefeed(userContext, postIds) {
  const {
    timelines: { posts },
  } = await helper.fetchTimeline('home', userContext);
  expect(posts, 'to equal', postIds);
}

function bump(item, array) {
  array = array.slice(); // clone
  const p = array.indexOf(item);

  if (p >= 0) {
    array.splice(p, 1);
  }

  return [item, ...array];
}

async function like(userContext, postId) {
  return await helper.like(postId, userContext.authToken);
}

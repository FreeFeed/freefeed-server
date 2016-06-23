/*eslint-env node, mocha */
/*global $database */
import { getSingleton } from '../../app/app';
import * as funcTestHelper from './functional_test_helper';
import { dbAdapter } from '../../app/models';


describe('Realtime (Socket.io)', () => {
  let app;
  before(async () => {
    app = await getSingleton();
  });

  beforeEach(async () => {
    await $database.flushdbAsync();
  })

  let lunaContext = {};
  let marsContext = {};

  beforeEach(funcTestHelper.createUserCtx(lunaContext, 'luna', 'pw'))
  beforeEach(funcTestHelper.createUserCtx(marsContext, 'mars', 'pw'))

  describe('User timeline', () => {
    it('Luna gets notifications about public posts', async () => {
      const user = await dbAdapter.getUserByUsername('mars')
      const feedIds = await dbAdapter.getUserTimelinesIds(user.id)

      let postPromise;
      let timeoutId;

      const callbacks = {
        'connect': async (client) => {
          client.emit('subscribe', { "timeline": [feedIds.Posts] });
          postPromise = funcTestHelper.createAndReturnPost(marsContext, 'test post');

          timeoutId = setTimeout(() => {
            throw new Error(`notification wasn't delivered`);
          }, 2000);
        },
        'post:new': async (data, client) => {
          clearTimeout(timeoutId);

          data.posts.id.should.eql((await postPromise).id);
          client.disconnect();
        }
      };

      await funcTestHelper.createRealtimeConnection(lunaContext, callbacks);
    });

    describe('Mars is a private user', () => {
      beforeEach(async () => {
        return funcTestHelper.goPrivate(marsContext)
      });

      it('Luna does not get notifications about his posts', async () => {
        const user = await dbAdapter.getUserByUsername('mars')
        const feedIds = await dbAdapter.getUserTimelinesIds(user.id)

        let timeoutId;

        const callbacks = {
          'connect': async (client) => {
            client.emit('subscribe', { "timeline": [feedIds.Posts] });
            await funcTestHelper.createAndReturnPost(marsContext, 'test post');

            timeoutId = setTimeout(() => {
              client.disconnect();
            }, 600);
          },
          'post:new': async (data, client) => {
            clearTimeout(timeoutId);
            throw new Error('there should not be notification');
          }
        };

        await funcTestHelper.createRealtimeConnection(lunaContext, callbacks);
      });
    });

    describe('Mars blocked luna', () => {
      beforeEach(async () => {
        await funcTestHelper.banUser(marsContext, lunaContext)
      });

      it('Luna does not get notifications about his posts', async () => {
        const user = await dbAdapter.getUserByUsername('mars')
        const feedIds = await dbAdapter.getUserTimelinesIds(user.id)

        let timeoutId;

        const callbacks = {
          'connect': async (client) => {
            client.emit('subscribe', { "timeline": [feedIds.Posts] });
            await funcTestHelper.createAndReturnPost(marsContext, 'test post');

            timeoutId = setTimeout(() => {
              client.disconnect();
            }, 600);
          },
          'post:new': async (data, client) => {
            clearTimeout(timeoutId);
            throw new Error('there should not be notification');
          }
        };

        await funcTestHelper.createRealtimeConnection(lunaContext, callbacks);
      });

      it('Mars does not get notifications about her posts', async () => {
        const user = await dbAdapter.getUserByUsername('luna')
        const feedIds = await dbAdapter.getUserTimelinesIds(user.id)

        let timeoutId;

        const callbacks = {
          'connect': async (client) => {
            client.emit('subscribe', { "timeline": [feedIds.Posts] });
            await funcTestHelper.createAndReturnPost(lunaContext, 'test post');

            timeoutId = setTimeout(() => {
              client.disconnect();
            }, 600);
          },
          'post:new': async (data, client) => {
            clearTimeout(timeoutId);
            throw new Error('there should not be notification');
          }
        };

        await funcTestHelper.createRealtimeConnection(marsContext, callbacks);
      });

      describe('Reactions', () => {
        let venusContext = {};
        let postId;

        beforeEach(async () => {
          venusContext = await funcTestHelper.createUserAsync('venus', 'pw')
          const post = await funcTestHelper.createAndReturnPost(venusContext, 'test post');
          postId = post.id;
        });

        it('Mars does not get notifications about her likes', async () => {
          const user = await dbAdapter.getUserByUsername('venus')
          const feedIds = await dbAdapter.getUserTimelinesIds(user.id)

          let timeoutId;

          const callbacks = {
            'connect': async (client) => {
              client.emit('subscribe', { "timeline": [feedIds.Posts] });
              await funcTestHelper.like(postId, lunaContext.authToken);

              timeoutId = setTimeout(() => {
                client.disconnect();
              }, 600);
            },
            'like:new': async (data, client) => {
              clearTimeout(timeoutId);
              throw new Error('there should not be notification');
            }
          };

          await funcTestHelper.createRealtimeConnection(marsContext, callbacks);
        });

        it('Mars does not get notifications about her comments', async () => {
          const user = await dbAdapter.getUserByUsername('venus')
          const feedIds = await dbAdapter.getUserTimelinesIds(user.id)

          let timeoutId;

          const callbacks = {
            'connect': async (client) => {
              client.emit('subscribe', { "timeline": [feedIds.Posts] });
              await funcTestHelper.createCommentAsync(lunaContext, postId, 'reply');

              timeoutId = setTimeout(() => {
                client.disconnect();
              }, 600);
            },
            'comment:new': async (data, client) => {
              clearTimeout(timeoutId);
              throw new Error('there should not be notification');
            }
          };

          await funcTestHelper.createRealtimeConnection(marsContext, callbacks);
        });
      });
    });
  });
});

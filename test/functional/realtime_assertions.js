import SocketIO from 'socket.io-client';

import { getSingleton as initApp } from '../../app/app'
import * as funcTestHelper from './functional_test_helper';

const eventTimeout = 2000;
const silenceTimeout = 600;

class Session {
  socket = null;
  context = {};

  static async create(userContext = { authToken: '' }) {
    const app = await initApp();
    const port = (process.env.PEPYATKA_SERVER_PORT || app.context.config.port);
    const options = {
      transports:             ['websocket'],
      'force new connection': true,
      query:                  `token=${encodeURIComponent(userContext.authToken)}`,
    };
    return new Promise((resolve, reject) => {
      const socket = SocketIO.connect(`http://localhost:${port}/`, options);
      socket.on('error', reject);
      socket.on('connect_error', reject);
      socket.on('connect', () => resolve(new Session(socket)));
    });
  }

  constructor(socket) {
    this.socket = socket;
  }

  send(event, data) {
    this.socket.emit(event, data);
  }

  disconnect() {
    this.socket.disconnect();
  }

  receive(event, timeout = eventTimeout) {
    return new Promise((resolve, reject) => {
      const success = (data) => {
        this.socket.off(event, success);
        clearTimeout(timer);
        resolve(data);
      };
      this.socket.on(event, success);
      const timer = setTimeout(() => reject(new Error('unexpected timeout')), timeout);
    });
  }
}

// unexpected-realtime plugin

export const name = 'unexpected-realtime';

export function installInto(expect) {
  // Types
  expect.addType({
    name:     'userContext',
    base:     'object',
    identify: (ctx) => ctx !== null && typeof ctx === 'object' && 'authToken' in ctx,
    inspect:  (ctx, depth, output, inspect) => {
      output
        .text('userContext(')
        .append(ctx.user ? inspect(ctx.user.username, depth) : 'ANONYMOUS')
        .text(')');
    }
  });

  expect.addType({
    name:     'realtimeSession',
    base:     'object',
    identify: (sess) => sess !== null && typeof sess === 'object' && sess instanceof Session,
    inspect:  (sess, depth, output, inspect) => output.text('Session(').append(inspect(sess.context, depth)).text(')'),
  });

  // Pre-conditions
  expect.addAssertion('<userContext> when subscribed to timeline <string> <assertion>', async (expect, viewer, timeline) => {
    const session = await Session.create(viewer);
    session.send('subscribe', { 'timeline': [timeline] });
    try {
      return await expect.shift(session);
    } finally {
      session.disconnect();
    }
  });

  expect.addAssertion('<realtimeSession> with post having id <string> <assertion>', (expect, session, postId) => {
    session.context.postId = postId;
    return expect.shift(session);
  });

  // Assertions
  expect.addAssertion('<realtimeSession> [not] to receive event <string>', async (expect, session, event) => {
    if (!expect.flags['not']) {
      try {
        return await session.receive(event);
      } catch (e) {
        // pass
      }
      expect.fail();
    } else {
      try {
        await session.receive(event, silenceTimeout);
      } catch (e) {
        return null;
      }
      expect.fail();
    }
    return null;
  });

  expect.addAssertion('<realtimeSession> to get post:* events from <userContext>', async (expect, session, publisher) => {
    expect.errorMode = 'nested';

    // Create post
    const [
      { id: postId },
      newPostEvent,
    ] = await Promise.all([
      funcTestHelper.createAndReturnPost(publisher, 'test post'),
      expect(session, 'to receive event', 'post:new'),
    ]);
    expect(newPostEvent.posts.id, 'to be', postId);

    // Delete post
    const [
      ,
      destroyPostEvent,
    ] = await Promise.all([
      funcTestHelper.deletePostAsync(publisher, postId),
      expect(session, 'to receive event', 'post:destroy'),
    ]);
    expect(destroyPostEvent.meta.postId, 'to be', postId);
  });

  expect.addAssertion('<realtimeSession> not to get post:* events from <userContext>', async (expect, session, publisher) => {
    expect.errorMode = 'nested';

    // Create post
    await Promise.all([
      funcTestHelper.createAndReturnPost(publisher, 'test post'),
      expect(session, 'not to receive event', 'post:new'),
    ]);
  });

  expect.addAssertion('<realtimeSession> [not] to get comment:* events from <userContext>', async (expect, session, publisher) => {
    expect.errorMode = 'nested';
    const noEvents = expect.flags['not'];

    expect(session.context, 'to have key', 'postId');
    const { postId } = session.context;

    await Promise.all([
      funcTestHelper.createCommentAsync(publisher, postId, 'reply'),
      expect(session, `${noEvents ? 'not ' : ''}to receive event`, 'comment:new'),
    ]);
  });

  expect.addAssertion('<realtimeSession> [not] to get like:* events from <userContext>', async (expect, session, publisher) => {
    expect.errorMode = 'nested';
    const noEvents = expect.flags['not'];

    expect(session.context, 'to have key', 'postId');
    const { postId } = session.context;

    await Promise.all([
      funcTestHelper.like(postId, publisher),
      expect(session, `${noEvents ? 'not ' : ''}to receive event`, 'like:new'),
    ]);
  });
}

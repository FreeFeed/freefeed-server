/* eslint-env node, mocha */
/* global $pg_database, $should */
import cleanDB from '../../dbCleaner';
import { dbAdapter, Timeline, User } from '../../../app/models';

describe('Timeline', () => {
  beforeEach(() => cleanDB($pg_database));

  describe('#create()', () => {
    let luna;

    beforeEach(async () => {
      luna = new User({ username: 'Luna', password: 'password' });
      await luna.create();
    });

    it('should create without error', (done) => {
      const timeline = new Timeline({
        name: 'name',
        userId: luna.id,
      });

      timeline
        .create()
        .then(() => {
          timeline.should.be.an.instanceOf(Timeline);
          timeline.should.not.be.empty;
          timeline.should.have.property('id');

          return dbAdapter.getTimelineById(timeline.id);
        })
        .then((newTimeline) => {
          newTimeline.should.be.an.instanceOf(Timeline);
          newTimeline.should.not.be.empty;
          newTimeline.should.have.property('id');
          newTimeline.id.should.eql(timeline.id);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('should ignore whitespaces in name', (done) => {
      const name = '   name    ';
      const timeline = new Timeline({ name, userId: luna.id });

      timeline
        .create()
        .then(() => dbAdapter.getTimelineById(timeline.id))
        .then((newTimeline) => {
          newTimeline.should.be.an.instanceOf(Timeline);
          newTimeline.should.not.be.empty;
          newTimeline.should.have.property('id');
          newTimeline.id.should.eql(timeline.id);
          newTimeline.name.should.eql(name.trim());
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('should not create with empty name', (done) => {
      const timeline = new Timeline({
        name: '',
        userId: luna.id,
      });

      timeline.create().catch((e) => {
        e.message.should.eql('Invalid');
        done();
      });
    });
  });

  describe('#findById()', () => {
    let luna;

    beforeEach(async () => {
      luna = new User({ username: 'Luna', password: 'password' });
      await luna.create();
    });

    it('should find timeline with a valid id', (done) => {
      const timeline = new Timeline({
        name: 'name',
        userId: luna.id,
      });

      timeline
        .create()
        .then(() => dbAdapter.getTimelineById(timeline.id))
        .then((newTimeline) => {
          newTimeline.should.be.an.instanceOf(Timeline);
          newTimeline.should.not.be.empty;
          newTimeline.should.have.property('id');
          newTimeline.id.should.eql(timeline.id);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });

    it('should not find timeline with an invalid id', (done) => {
      const identifier = 'timeline:identifier';

      dbAdapter
        .getTimelineById(identifier)
        .then((timeline) => {
          $should.not.exist(timeline);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
  });

  describe('#getSubscribers()', () => {
    let userA, userB;

    beforeEach(async () => {
      userA = new User({ username: 'Luna', password: 'password' });
      userB = new User({ username: 'Mars', password: 'password' });

      await Promise.all([userA.create(), userB.create()]);
    });

    it('should subscribe to timeline', (done) => {
      const attrs = { body: 'Post body' };

      userB
        .newPost(attrs)
        .then((newPost) => newPost.create())
        .then(() => userA.subscribeTo(userB))
        .then(() => userB.getPostsTimeline())
        .then((timeline) => timeline.getSubscribers())
        .then((users) => {
          users.should.not.be.empty;
          users.length.should.eql(1);

          const [user] = users;
          user.should.have.property('id');
          user.id.should.eql(userA.id);
          done();
        })
        .catch((e) => {
          done(e);
        });
    });
  });
});

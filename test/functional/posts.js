/* eslint-env node, mocha */
/* global $pg_database, $should */
import request from 'superagent'
import _ from 'lodash'
import fetch from 'node-fetch'
import knexCleaner from 'knex-cleaner'

import { getSingleton } from '../../app/app'
import { DummyPublisher } from '../../app/pubsub'
import { PubSub } from '../../app/models'
import * as funcTestHelper from './functional_test_helper'


describe('PostsController', () => {
  let app

  before(async () => {
    app = await getSingleton()
    PubSub.setPublisher(new DummyPublisher())
  })

  beforeEach(async () => {
    await knexCleaner.clean($pg_database)
  })

  describe('#create()', () => {
    let ctx = {}

    beforeEach(async () => {
      ctx = await funcTestHelper.createUserAsync('Luna', 'password')
    })

    it('should create a post with a valid user', (done) => {
      const body = 'Post body'

      funcTestHelper.createPost(ctx, body)((req, res) => {
        res.body.should.not.be.empty
        res.body.should.have.property('posts')
        res.body.posts.should.have.property('body')
        res.body.posts.body.should.eql(body)
        res.body.posts.commentsDisabled.should.eql('0')

        done()
      })
    })

    it('should not create a post with an invalid user', (done) => {
      const body = 'Post body'

      ctx.authToken = 'token'
      funcTestHelper.createPost(ctx, body)((err) => {
        err.should.not.be.empty
        err.status.should.eql(401)

        done()
      })
    })

    it('should create a post with comments disabled', async () => {
      const body = 'Post body'
      const commentsDisabled = true

      const response = await funcTestHelper.createPostWithCommentsDisabled(ctx, body, commentsDisabled)
      response.status.should.eql(200)

      const data = await response.json()
      data.should.not.be.empty
      data.should.have.property('posts')
      data.posts.should.have.property('body')
      data.posts.body.should.eql(body)
      data.posts.commentsDisabled.should.eql('1')
    })

    it('should create a post with comments enabled', async () => {
      const body = 'Post body'
      const commentsDisabled = false

      const response = await funcTestHelper.createPostWithCommentsDisabled(ctx, body, commentsDisabled)
      response.status.should.eql(200)

      const data = await response.json()
      data.should.not.be.empty
      data.should.have.property('posts')
      data.posts.should.have.property('body')
      data.posts.body.should.eql(body)
      data.posts.commentsDisabled.should.eql('0')
    })

    describe('private messages', () => {
      let marsCtx

      beforeEach(async () => {
        marsCtx = await funcTestHelper.createUserAsync('mars', 'password');
      })

      it('should create public post that is visible to another user', (done) => {
        const body = 'body'

        funcTestHelper.createPost(ctx, body)((err, res) => {
          res.body.should.not.be.empty
          res.body.should.have.property('posts')
          res.body.posts.should.have.property('body')
          res.body.posts.body.should.eql(body)
          const post = res.body.posts
          request
            .get(`${app.context.config.host}/v1/posts/${post.id}`)
            .query({ authToken: marsCtx.authToken })
            .end((err, res) => {
              res.body.should.not.be.empty
              res.body.should.have.property('posts')
              res.body.posts.should.have.property('body')
              res.body.posts.body.should.eql(body)
              done()
            })
        })
      })

      it('should not be able to send private message if friends are not mutual', (done) => {
        const body = 'body'

        request
          .post(`${app.context.config.host}/v1/posts`)
          .send({ post: { body }, meta: { feeds: [marsCtx.username] }, authToken: ctx.authToken })
          .end((err) => {
            err.should.not.be.empty
            err.status.should.eql(403)
            err.response.error.should.have.property('text')
            JSON.parse(err.response.error.text).err.should.eql("You can't send private messages to friends that are not mutual")
            done()
          })
      })

      describe('for mutual friends', () => {
        beforeEach(async () => {
          await funcTestHelper.mutualSubscriptions([marsCtx, ctx])
        })

        describe('are protected', () => {
          let zeusCtx
            , post

          beforeEach(async () => {
            [zeusCtx, post] = await Promise.all([
              funcTestHelper.createUserAsync('zeus', 'password'),
              funcTestHelper.createAndReturnPostToFeed(marsCtx, ctx, 'body')
            ]);
          })

          it('should not be liked by person that is not in recipients', (done) => {
            request
              .post(`${app.context.config.host}/v1/posts/${post.id}/like`)
              .send({ authToken: zeusCtx.authToken })
              .end((err) => {
                try {
                  err.should.not.be.empty
                  err.status.should.eql(404)
                  const error = JSON.parse(err.response.error.text)
                  error.err.should.eql(`Can't find post`)
                } catch (e) {
                  done(e);
                  return;
                }

                funcTestHelper.getTimeline(`/v1/timelines/${zeusCtx.username}/likes`, zeusCtx.authToken, (err, res) => {
                  try {
                    res.body.should.not.have.property('posts')
                    done()
                  } catch (e) {
                    done(e);
                  }
                })
              })
          })

          it('should not be commented by person that is not in recipients', (done) => {
            const body = 'comment'
            funcTestHelper.createComment(body, post.id, zeusCtx.authToken, (err) => {
              err.should.not.be.empty
              err.status.should.eql(404)
              const error = JSON.parse(err.response.error.text)
              error.err.should.eql('Not found')

              funcTestHelper.getTimeline(`/v1/timelines/${zeusCtx.username}/comments`, zeusCtx.authToken, (err, res) => {
                res.body.should.not.have.property('posts')
                done()
              })
            })
          })
        })

        it('should be able to send private message', (done) => {
          const body = 'body'

          request
            .post(`${app.context.config.host}/v1/posts`)
            .send({ post: { body }, meta: { feeds: [marsCtx.username] }, authToken: ctx.authToken })
            .end((err, res) => {
              res.body.should.not.be.empty
              res.body.should.have.property('posts')
              res.body.posts.should.have.property('body')
              res.body.posts.body.should.eql(body)
              done()
            })
        })

        it('should publish private message to home feed', (done) => {
          const body = 'body'

          request
            .post(`${app.context.config.host}/v1/posts`)
            .send({ post: { body }, meta: { feeds: [marsCtx.username] }, authToken: ctx.authToken })
            .end((err, res) => {
              res.body.should.not.be.empty
              res.body.should.have.property('posts')
              res.body.posts.should.have.property('body')
              res.body.posts.body.should.eql(body)

              funcTestHelper.getTimeline('/v1/timelines/home', marsCtx.authToken, (err, res) => {
                res.body.should.have.property('posts')
                res.body.posts.length.should.eql(1)
                res.body.posts[0].should.have.property('body')
                res.body.posts[0].body.should.eql(body)
                funcTestHelper.getTimeline('/v1/timelines/home', ctx.authToken, (err, res) => {
                  res.body.should.have.property('posts')
                  res.body.posts.length.should.eql(1)
                  res.body.posts[0].should.have.property('body')
                  res.body.posts[0].body.should.eql(body)
                  done()
                })
              })
            })
        })

        it('should send private message that cannot be read by anyone else', (done) => {
          const body = 'body'

          request
            .post(`${app.context.config.host}/v1/posts`)
            .send({ post: { body }, meta: { feeds: [marsCtx.username] }, authToken: ctx.authToken })
            .end((err, res) => {
              const post = res.body.posts

              let authTokenC

              request
                .post(`${app.context.config.host}/v1/users`)
                .send({
                  username: 'zeus',
                  password: 'password'
                })
                .end((err, res) => {
                  authTokenC = res.body.users.token

                  request
                    .get(`${app.context.config.host}/v1/posts/${post.id}`)
                    .query({ authToken: authTokenC })
                    .end((err) => {
                      err.should.not.be.empty
                      err.status.should.eql(403)
                      const error = JSON.parse(err.response.error.text)
                      error.err.should.eql('Not found')
                      done()
                    })
                })
            })
        })

        it('should send private message that can be read by recipients', (done) => {
          const body = 'body'

          request
            .post(`${app.context.config.host}/v1/posts`)
            .send({ post: { body }, meta: { feeds: [marsCtx.username] }, authToken: ctx.authToken })
            .end((err, res) => {
              const post = res.body.posts

              request
                .get(`${app.context.config.host}/v1/posts/${post.id}`)
                .query({ authToken: marsCtx.authToken })
                .end((err, res) => {
                  res.body.should.not.be.empty
                  res.body.posts.body.should.eql(post.body)
                  done()
                })
            })
        })

        it('should send private message to private feed for both users', (done) => {
          const body = 'body'

          request
            .post(`${app.context.config.host}/v1/posts`)
            .send({ post: { body }, meta: { feeds: [marsCtx.username] }, authToken: ctx.authToken })
            .end(() => {
              funcTestHelper.getTimeline('/v1/timelines/filter/directs', ctx.authToken, (err, res) => {
                res.body.should.have.property('posts')
                res.body.posts.length.should.eql(1)
                res.body.posts[0].should.have.property('body')
                res.body.posts[0].body.should.eql(body)
                funcTestHelper.getTimeline('/v1/timelines/filter/directs', marsCtx.authToken, (err, res) => {
                  res.body.should.have.property('posts')
                  res.body.posts.length.should.eql(1)
                  res.body.posts[0].should.have.property('body')
                  res.body.posts[0].body.should.eql(body)
                  done()
                })
              })
            })
        })
      })
    })

    describe('in a group', () => {
      const groupName = 'pepyatka-dev'
      const otherUserName = 'yole'
      let otherUserAuthToken

      beforeEach(async () => {
        const screenName = 'Pepyatka Developers';

        await funcTestHelper.createGroupAsync(ctx, groupName, screenName)

        const yole = await funcTestHelper.createUserAsync(otherUserName, 'pw')
        otherUserAuthToken = yole.authToken
      })

      it('should allow subscribed user to post to group', (done) => {
        const body = 'Post body'

        request
          .post(`${app.context.config.host}/v1/posts`)
          .send({ post: { body }, meta: { feeds: [groupName] }, authToken: ctx.authToken })
          .end((err, res) => {
            res.body.should.not.be.empty
            res.body.should.have.property('posts')
            res.body.posts.should.have.property('body')
            res.body.posts.body.should.eql(body)

            request
              .get(`${app.context.config.host}/v1/timelines/${groupName}`)
              .query({ authToken: ctx.authToken })
              .end((err, res) => {
                res.body.posts.length.should.eql(1)
                res.body.posts[0].body.should.eql(body)

                // Verify that the post didn't appear in the user's own timeline
                request
                  .get(`${app.context.config.host}/v1/timelines/${ctx.username}`)
                  .query({ authToken: context.authToken })
                  .end((err, res) => {
                    res.should.not.be.empty
                    res.body.should.not.be.empty
                    res.body.should.have.property('timelines')
                    res.body.timelines.should.have.property('name')
                    res.body.timelines.name.should.eql('Posts')
                    res.body.timelines.should.not.have.property('posts')
                    res.body.should.not.have.property('posts')

                    done()
                  })
              })
          })
      })

      it("should cross-post between a group and a user's feed", (done) => {
        const body = 'Post body'

        request
          .post(`${app.context.config.host}/v1/posts`)
          .send({ post: { body }, meta: { feeds: [groupName, ctx.username] }, authToken: ctx.authToken })
          .end((err, res) => {
            _.isUndefined(res).should.be.false
            res.body.should.not.be.empty
            res.body.should.have.property('posts')
            res.body.posts.should.have.property('body')
            res.body.posts.body.should.eql(body)

            request
              .get(`${app.context.config.host}/v1/timelines/${groupName}`)
              .query({ authToken: ctx.authToken })
              .end((err, res) => {
                res.body.posts.length.should.eql(1)
                res.body.posts[0].body.should.eql(body)

                // Verify that the post didn't appear in the user's own timeline
                request
                  .get(`${app.context.config.host}/v1/timelines/${ctx.username}`)
                  .query({ authToken: context.authToken })
                  .end((err, res) => {
                    res.body.posts.length.should.eql(1)
                    res.body.posts[0].body.should.eql(body)

                    done()
                  })
              })
          })
      })

      it("should update group's last activity", (done) => {
        const body = 'Post body'

        funcTestHelper.getTimeline(`/v1/users/${groupName}`, ctx.authToken, (err, res) => {
          const oldGroupTimestamp = res.body.users.updatedAt;

          request
            .post(`${app.context.config.host}/v1/posts`)
            .send({ post: { body }, meta: { feeds: [groupName] }, authToken: ctx.authToken })
            .end((err, res) => {
              const postTimestamp = res.body.posts.createdAt
              res.status.should.eql(200)

              funcTestHelper.getTimeline(`/v1/users/${groupName}`, ctx.authToken, (err, res) => {
                const groupTimestamp = res.body.users.updatedAt;

                groupTimestamp.should.be.gt(oldGroupTimestamp)
                groupTimestamp.should.be.gte(postTimestamp)

                done()
              })
            })
        })
      })

      it('should show post to group in the timeline of the subscribing user', (done) => {
        request
          .post(`${app.context.config.host}/v1/users/${groupName}/subscribe`)
          .send({ authToken: otherUserAuthToken })
          .end((err, res) => {
            res.status.should.eql(200)
            const body = 'Post body'

            request
              .post(`${app.context.config.host}/v1/posts`)
              .send({ post: { body }, meta: { feeds: [groupName] }, authToken: ctx.authToken })
              .end((err, res) => {
                res.status.should.eql(200)
                funcTestHelper.getTimeline('/v1/timelines/home', otherUserAuthToken, (err, res) => {
                  res.body.should.have.property('posts')
                  res.body.posts.length.should.eql(1)
                  res.body.posts[0].body.should.eql(body)
                  done()
                })
              })
          })
      })

      it('should not show post to group in the timeline of another user', (done) => {
        request
          .post(`${app.context.config.host}/v1/users/${ctx.username}/subscribe`)
          .send({ authToken: otherUserAuthToken })
          .end((err, res) => {
            res.status.should.eql(200)
            const body = 'Post body'

            request
              .post(`${app.context.config.host}/v1/posts`)
              .send({ post: { body }, meta: { feeds: [groupName] }, authToken: ctx.authToken })
              .end((err, res) => {
                res.status.should.eql(200)
                funcTestHelper.getTimeline('/v1/timelines/home', otherUserAuthToken, (err, res) => {
                  res.body.should.not.have.property('posts')
                  done()
                })
              })
          })
      })

      it('should not show liked post to group in the timeline of another user', (done) => {
        request
          .post(`${app.context.config.host}/v1/users/${ctx.username}/subscribe`)
          .send({ authToken: otherUserAuthToken })
          .end((err, res) => {
            res.status.should.eql(200)
            const body = 'Post body'

            request
              .post(`${app.context.config.host}/v1/posts`)
              .send({ post: { body }, meta: { feeds: [groupName] }, authToken: ctx.authToken })
              .end((err, res) => {
                res.status.should.eql(200)
                const post = res.body.posts
                request
                  .post(`${app.context.config.host}/v1/posts/${post.id}/like`)
                  .send({ authToken: ctx.authToken })
                  .end(() => {
                    funcTestHelper.getTimeline('/v1/timelines/home', otherUserAuthToken, (err, res) => {
                      res.body.should.not.have.property('posts')
                      done()
                    })
                  })
              })
          })
      })

      it('should not show liked post to group in the user posts', (done) => {
        const body = 'Post body'

        request
          .post(`${app.context.config.host}/v1/posts`)
          .send({ post: { body }, meta: { feeds: [groupName] }, authToken: ctx.authToken })
          .end((err, res) => {
            res.status.should.eql(200)
            const post = res.body.posts
            request
              .post(`${app.context.config.host}/v1/posts/${post.id}/like`)
              .send({ authToken: ctx.authToken })
              .end(() => {
                funcTestHelper.getTimeline(`/v1/timelines/${ctx.username}`, ctx.authToken, (err, res) => {
                  res.body.should.not.have.property('posts')
                  done()
                })
              })
          })
      })

      it("should not allow a user to post to another user's feed", (done) => {
        request
          .post(`${app.context.config.host}/v1/posts`)
          .send({ post: { body: 'Post body' }, meta: { feeds: [otherUserName] }, authToken: ctx.authToken })
          .end((err, res) => {
            err.status.should.eql(403)
            res.body.err.should.eql("You can't send private messages to friends that are not mutual")

            done()
          })
      })

      it('should not allow a user to post to a group to which they are not subscribed', (done) => {
        request
          .post(`${app.context.config.host}/v1/posts`)
          .send({
            post:      { body: 'Post body' },
            meta:      { feeds: [groupName] },
            authToken: otherUserAuthToken
          })
          .end((err, res) => {
            err.should.not.be.empty
            err.status.should.eql(403)
            res.body.err.should.eql("You can't post to a group to which you aren't subscribed")

            done()
          })
      })
    })
  })

  describe('#like()', () => {
    let context = {};
    let marsCtx;
    let otherUserAuthToken;

    beforeEach(async () => {
      let post = {};
      context = await funcTestHelper.createUserAsync('Luna', 'password');

      [marsCtx, post] = await Promise.all([
        funcTestHelper.createUserAsync('mars', 'password2'),
        funcTestHelper.createAndReturnPost(context, 'Post body')
      ]);

      context.post = post;
      otherUserAuthToken = marsCtx.authToken;
    })

    describe('in a group', () => {
      const groupName = 'pepyatka-dev'

      beforeEach(async () => {
        const screenName = 'Pepyatka Developers';
        await funcTestHelper.createGroupAsync(context, groupName, screenName)
      })

      it("should not update group's last activity", (done) => {
        const body = 'Post body'

        request
          .post(`${app.context.config.host}/v1/posts`)
          .send({ post: { body }, meta: { feeds: [groupName] }, authToken: context.authToken })
          .end((err, res) => {
            res.status.should.eql(200)
            funcTestHelper.getTimeline(`/v1/users/${groupName}`, context.authToken, (err, res) => {
              res.status.should.eql(200)
              const lastUpdatedAt = res.body.users.updatedAt

              request
                .post(`${app.context.config.host}/v1/posts/${context.post.id}/like`)
                .send({ authToken: otherUserAuthToken })
                .end((err, res) => {
                  res.status.should.eql(200)
                  funcTestHelper.getTimeline(`/v1/users/${groupName}`, context.authToken, (err, res) => {
                    res.status.should.eql(200)
                    res.body.should.have.property('users')
                    res.body.users.should.have.property('updatedAt')
                    lastUpdatedAt.should.be.eql(res.body.users.updatedAt)

                    done()
                  })
                })
            })
          })
      })
    })

    it('should like post with a valid user not more than 1 time', async () => {
      {
        const response = await funcTestHelper.like(context.post.id, otherUserAuthToken)
        response.status.should.eql(200)
      }

      {
        const response = await funcTestHelper.like(context.post.id, otherUserAuthToken)
        response.status.should.eql(403)

        const data = await response.json()
        data.should.have.property('err')
        data.err.should.eql("You can't like post that you have already liked")
      }
    })

    it('should like post with a valid user not more than 1 time (parallel requests)', async () => {
      const responsesPromise = Promise.all([
        funcTestHelper.like(context.post.id, otherUserAuthToken),
        funcTestHelper.like(context.post.id, otherUserAuthToken),
        funcTestHelper.like(context.post.id, otherUserAuthToken),
        funcTestHelper.like(context.post.id, otherUserAuthToken),
        funcTestHelper.like(context.post.id, otherUserAuthToken),
        funcTestHelper.like(context.post.id, otherUserAuthToken),
      ]);

      const responses = await responsesPromise;
      const errorsCount = responses.filter((r) => r.status == 403).length;

      errorsCount.should.equal(5);
    });

    it('should not like post with an invalid user', (done) => {
      request
        .post(`${app.context.config.host}/v1/posts/${context.post.id}/like`)
        .end((err) => {
          err.should.not.be.empty
          err.status.should.eql(401)
          done()
        })
    })

    it('should not like invalid post', (done) => {
      request
        .post(`${app.context.config.host}/v1/posts/:id/like`)
        .send({ authToken: context.authToken })
        .end((err) => {
          err.should.not.be.empty
          err.status.should.eql(404)
          done()
        })
    })

    it("should not like user's own post", async () => {
      const response = await funcTestHelper.like(context.post.id, context.authToken)
      response.status.should.eql(403)

      const data = await response.json()
      data.should.have.property('err')
      data.err.should.eql("You can't like your own post")
    })

    describe('Interaction with banned user', () => {
      let postOfMars;

      beforeEach(async() => {
        postOfMars = await funcTestHelper.createAndReturnPost(marsCtx, 'I am mars!');
        await funcTestHelper.banUser(context, marsCtx);
      });

      it(`should not allow like on  banned user's post`, async () => {
        const response = await funcTestHelper.like(postOfMars.id, context.authToken);
        response.status.should.eql(403);
      });

      it(`should not allow like on post of user who banned us`, async () => {
        const response = await funcTestHelper.like(context.post.id, marsCtx.authToken);
        response.status.should.eql(403);
      });
    });
  });

  describe('#unlike()', () => {
    let context = {}
    let otherUserAuthToken

    beforeEach(async () => {
      context = await funcTestHelper.createUserAsync('Luna', 'password');

      const [marsCtx, post] = await Promise.all([
        funcTestHelper.createUserAsync('mars', 'password2'),
        funcTestHelper.createAndReturnPost(context, 'Post body')
      ]);

      context.post = post;
      otherUserAuthToken = marsCtx.authToken;
    })

    it('unlike should fail if post was not yet liked and succeed after it was liked with a valid user', (done) => {
      request
        .post(`${app.context.config.host}/v1/posts/${context.post.id}/unlike`)
        .send({ authToken: otherUserAuthToken })
        .end((err) => {
          err.should.not.be.empty
          err.status.should.eql(403)
          err.response.error.should.have.property('text')
          JSON.parse(err.response.error.text).err.should.eql("You can't un-like post that you haven't yet liked")

          request
            .post(`${app.context.config.host}/v1/posts/${context.post.id}/like`)
            .send({ authToken: otherUserAuthToken })
            .end((err, res) => {
              res.body.should.be.empty
              $should.not.exist(err)

              request
                .post(`${app.context.config.host}/v1/posts/${context.post.id}/unlike`)
                .send({ authToken: otherUserAuthToken })
                .end((err, res) => {
                  res.body.should.be.empty
                  $should.not.exist(err)

                  done()
                })
            })
        })
    })

    it('should not unlike post with an invalid user', (done) => {
      request
        .post(`${app.context.config.host}/v1/posts/${context.post.id}/unlike`)
        .end((err) => {
          err.should.not.be.empty
          err.status.should.eql(401)
          done()
        })
    })

    it('should not unlike invalid post', (done) => {
      request
        .post(`${app.context.config.host}/v1/posts/:id/unlike`)
        .send({ authToken: context.authToken })
        .end((err) => {
          err.should.not.be.empty
          err.status.should.eql(404)
          done()
        })
    })

    it("should not un-like user's own post", async () => {
      const response = await funcTestHelper.unlike(context.post.id, context.authToken)
      response.status.should.eql(403)

      const data = await response.json()
      data.should.have.property('err')
      data.err.should.eql("You can't un-like your own post")
    })
  })

  describe('#disableComments()', () => {
    let context = {}
    let otherUserAuthToken

    beforeEach(async () => {
      context = await funcTestHelper.createUserAsync('Luna', 'password');

      const [marsCtx, post] = await Promise.all([
        funcTestHelper.createUserAsync('mars', 'password2'),
        funcTestHelper.createAndReturnPost(context, 'Post body')
      ]);

      context.post = post;
      otherUserAuthToken = marsCtx.authToken;
    })

    it('should disable comments for own post', async () => {
      {
        const response = await funcTestHelper.disableComments(context.post.id, context.authToken)
        response.status.should.eql(200)
      }

      {
        const response = await funcTestHelper.readPostAsync(context.post.id, context)
        response.status.should.eql(200)

        const data = await response.json()
        data.posts.commentsDisabled.should.eql('1')
      }
    })

    it("should not disable comments for another user's post", async () => {
      {
        const response = await funcTestHelper.disableComments(context.post.id, otherUserAuthToken)
        response.status.should.eql(403)

        const data = await response.json()
        data.should.have.property('err')
        data.err.should.eql("You can't disable comments for another user's post")
      }

      {
        const response = await funcTestHelper.readPostAsync(context.post.id, context)
        response.status.should.eql(200)

        const data = await response.json()
        data.posts.commentsDisabled.should.eql('0')
      }
    })
  })

  describe('#enableComments()', () => {
    let context = {}
    let otherUserAuthToken

    beforeEach(async () => {
      context = await funcTestHelper.createUserAsync('Luna', 'password');

      const [marsCtx, response] = await Promise.all([
        funcTestHelper.createUserAsync('mars', 'password2'),
        funcTestHelper.createPostWithCommentsDisabled(context, 'Post body', true)
      ]);

      const data = await response.json()

      context.post = data.posts
      otherUserAuthToken = marsCtx.authToken;
    })

    it('should enable comments for own post', async () => {
      {
        const response = await funcTestHelper.enableComments(context.post.id, context.authToken)
        response.status.should.eql(200)
      }

      {
        const response = await funcTestHelper.readPostAsync(context.post.id, context)
        response.status.should.eql(200)

        const data = await response.json()
        data.posts.commentsDisabled.should.eql('0')
      }
    })

    it("should not enable comments for another user's post", async () => {
      {
        const response = await funcTestHelper.enableComments(context.post.id, otherUserAuthToken)
        response.status.should.eql(403)

        const data = await response.json()
        data.should.have.property('err')
        data.err.should.eql("You can't enable comments for another user's post")
      }

      {
        const response = await funcTestHelper.readPostAsync(context.post.id, context)
        response.status.should.eql(200)

        const data = await response.json()
        data.posts.commentsDisabled.should.eql('1')
      }
    })
  })

  describe('#update()', () => {
    let context = {}
    let otherUserAuthToken

    beforeEach(async () => {
      context = await funcTestHelper.createUserAsync('Luna', 'password');

      const [yoleCtx, post] = await Promise.all([
        funcTestHelper.createUserAsync('yole', 'pw'),
        funcTestHelper.createAndReturnPost(context, 'Post body')
      ]);

      context.post = post;
      otherUserAuthToken = yoleCtx.authToken;
    })

    it('should update post with a valid user', (done) => {
      const newBody = 'New body'
      request
        .post(`${app.context.config.host}/v1/posts/${context.post.id}`)
        .send({
          post:      { body: newBody },
          authToken: context.authToken,
          '_method': 'put'
        })
        .end((err, res) => {
          res.body.should.not.be.empty
          res.body.should.have.property('posts')
          res.body.posts.should.have.property('body')
          res.body.posts.body.should.eql(newBody)

          done()
        })
    })

    it('should not update post with a invalid user', (done) => {
      const newBody = 'New body'
      request
        .post(`${app.context.config.host}/v1/posts/${context.post.id}`)
        .send({
          post:      { body: newBody },
          '_method': 'put'
        })
        .end((err) => {
          err.should.not.be.empty
          err.status.should.eql(401)

          done()
        })
    })

    it("should not update another user's post", (done) => {
      const newBody = 'New body'
      request
        .post(`${app.context.config.host}/v1/posts/${context.post.id}`)
        .send({
          post:      { body: newBody },
          authToken: otherUserAuthToken,
          '_method': 'put'
        })
        .end((err, res) => {
          err.status.should.eql(403)
          res.body.err.should.eql("You can't update another user's post")

          done()
        })
    })

    it('should update post with adding/removing attachments', async () => {
      const newPost = {
        body:        'New body',
        attachments: []
      }

      // Create attachments
      {
        const attachmentResponse = await funcTestHelper.createMockAttachmentAsync(context)
        newPost.attachments.push(attachmentResponse.id)
      }
      {
        const attachmentResponse = await funcTestHelper.createMockAttachmentAsync(context)
        newPost.attachments.push(attachmentResponse.id)
      }

      // Add attachments to the post
      {
        const response = await funcTestHelper.updatePostAsync(context, newPost)
        response.status.should.eql(200)

        const data = await response.json()
        data.should.not.be.empty
        data.should.have.property('posts')
        data.posts.body.should.eql(newPost.body)
        data.should.have.property('attachments')
        data.posts.attachments.should.eql(newPost.attachments)
      }

      // Remove attachments from the post
      {
        const anotherPost = {
          body:        'Another body',
          attachments: [newPost.attachments[0]] // leave the first attachment only
        }

        const response = await funcTestHelper.updatePostAsync(context, anotherPost)
        response.status.should.eql(200)

        const data = await response.json()
        data.should.not.be.empty
        data.should.have.property('posts')
        data.posts.body.should.eql(anotherPost.body)
        data.should.have.property('attachments')
        data.posts.attachments.should.eql(anotherPost.attachments)
      }
    })
  })

  describe('#show()', () => {
    let context = {}

    beforeEach(async () => {
      context = await funcTestHelper.createUserAsync('Luna', 'password');
      context.post = await funcTestHelper.createAndReturnPost(context, 'Post body')
    })

    it('should show a post', (done) => {
      request
        .get(`${app.context.config.host}/v1/posts/${context.post.id}`)
        .query({ authToken: context.authToken })
        .end((err, res) => {
          res.body.should.not.be.empty
          res.body.should.have.property('posts')
          res.body.posts.should.have.property('body')
          res.body.posts.body.should.eql(context.post.body)

          done()
        })
    })

    it('should show a post to anonymous user', async () => {
      const response = await fetch(`${app.context.config.host}/v1/posts/${context.post.id}`)
      response.status.should.eql(200, `anonymous user couldn't read post`)

      const data = await response.json()
      data.posts.body.should.eql(context.post.body)
    })

    it('should return 404 given an invalid post ID', (done) => {
      request
        .get(`${app.context.config.host}/v1/posts/123_no_such_id`)
        .query({ authToken: context.authToken })
        .end((err, res) => {
          err.status.should.eql(404)
          res.body.err.should.eql("Can't find post")

          done()
        })
    })

    describe('with likes', async () => {
      let users

      beforeEach(async () => {
        const promises = [];
        for (let i = 0; i < 10; i++) {
          promises.push(funcTestHelper.createUserAsync(`lunokhod${i}`, 'password'))
        }
        users = await Promise.all(promises)

        await Promise.all(_.flatMap(users, (u) => [
          funcTestHelper.subscribeToAsync(u, context),
          funcTestHelper.subscribeToAsync(context, u)
        ]));

        await funcTestHelper.goPrivate(context)

        await Promise.all(users.map((u) => funcTestHelper.like(context.post.id, u.authToken)))
      })

      it('should show all likes', async () => {
        const response = await funcTestHelper.readPostAsync(context.post.id, users[5])
        response.status.should.eql(200, `user couldn't read post`)

        const data = await response.json()
        data.posts.likes.length.should.eql(3)
        data.posts.omittedLikes.should.eql(7)
      })
    })
  })

  describe('#hide()', () => {
    let context = {}

    beforeEach(async () => {
      context = await funcTestHelper.createUserAsync('Luna', 'password');
      context.post = await funcTestHelper.createAndReturnPost(context, 'Post body')
    })

    it('should hide and unhide post', (done) => {
      request
        .post(`${app.context.config.host}/v1/posts/${context.post.id}/hide`)
        .send({ authToken: context.authToken, })
        .end(() => {
          funcTestHelper.getTimeline('/v1/timelines/home', context.authToken, (err, res) => {
            res.should.not.be.empty
            res.body.should.not.be.empty
            res.body.should.have.property('timelines')
            res.body.timelines.should.have.property('name')
            res.body.timelines.name.should.eql('RiverOfNews')
            res.body.timelines.should.have.property('posts')
            res.body.should.have.property('posts')
            res.body.posts.length.should.eql(1)
            const post = res.body.posts[0]
            post.should.have.property('isHidden')
            post.isHidden.should.eql(true)

            request
              .post(`${app.context.config.host}/v1/posts/${context.post.id}/unhide`)
              .send({ authToken: context.authToken, })
              .end(() => {
                funcTestHelper.getTimeline('/v1/timelines/home', context.authToken, (err, res) => {
                  res.should.not.be.empty
                  res.body.should.not.be.empty
                  res.body.should.have.property('timelines')
                  res.body.timelines.should.have.property('name')
                  res.body.timelines.name.should.eql('RiverOfNews')
                  res.body.timelines.should.have.property('posts')
                  res.body.should.have.property('posts')
                  res.body.posts.length.should.eql(1)
                  const post = res.body.posts[0]
                  post.should.not.have.property('isHidden')
                  done()
                })
              })
          })
        })
    })
  })

  describe('#destroy()', () => {
    const username = 'Luna'
    let context = {}
    let otherUserAuthToken

    beforeEach(async () => {
      context = await funcTestHelper.createUserAsync(username, 'password');

      const [yoleCtx, post] = await Promise.all([
        funcTestHelper.createUserAsync('yole', 'pw'),
        funcTestHelper.createAndReturnPost(context, 'Post body')
      ]);

      context.post = post;
      otherUserAuthToken = yoleCtx.authToken;
    })

    it('should destroy valid post', (done) => {
      request
        .post(`${app.context.config.host}/v1/posts/${context.post.id}`)
        .send({
          authToken: context.authToken,
          '_method': 'delete'
        })
        .end((err, res) => {
          res.body.should.be.empty
          res.status.should.eql(200)

          request
            .get(`${app.context.config.host}/v1/timelines/${username}`)
            .query({ authToken: context.authToken })
            .end((err, res) => {
              res.should.not.be.empty
              res.body.should.not.be.empty
              res.body.should.have.property('timelines')
              res.body.timelines.should.have.property('name')
              res.body.timelines.name.should.eql('Posts')
              res.body.timelines.should.not.have.property('posts')
              res.body.should.not.have.property('posts')
              done()
            })
        })
    })

    it('should not destroy valid post without user', (done) => {
      request
        .post(`${app.context.config.host}/v1/posts/${context.post.id}`)
        .send({ '_method': 'delete' })
        .end((err) => {
          err.should.not.be.empty
          err.status.should.eql(401)
          done()
        })
    })

    it("should not destroy another user's post", (done) => {
      request
        .post(`${app.context.config.host}/v1/posts/${context.post.id}`)
        .send({
          authToken: otherUserAuthToken,
          '_method': 'delete'
        })
        .end((err, res) => {
          err.status.should.eql(403)
          res.body.err.should.eql("You can't delete another user's post")

          done()
        })
    })
  })
})

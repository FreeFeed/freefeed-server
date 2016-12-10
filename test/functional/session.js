/* eslint-env node, mocha */
/* global $pg_database */
import request from 'superagent'
import fetch from 'node-fetch'
import knexCleaner from 'knex-cleaner'

import { getSingleton } from '../../app/app'
import { DummyPublisher } from '../../app/pubsub'
import { PubSub, User } from '../../app/models'


describe('SessionController', () => {
  let app

  before(async () => {
    app = await getSingleton()
    PubSub.setPublisher(new DummyPublisher())
  })

  beforeEach(async () => {
    await knexCleaner.clean($pg_database)
  })

  describe('#create()', () => {
    let user, userData;

    beforeEach(async () => {
      userData = {
        username: 'Luna',
        password: 'password'
      }
      user = new User(userData)

      await user.create()
    })

    it('should sign in with a valid user', (done) => {
      request
        .post(`${app.context.config.host}/v1/session`)
        .send({ username: userData.username, password: userData.password })
        .end((err, res) => {
          if (err) {
            done(err);
            return;
          }
          res.should.not.be.empty
          res.body.should.not.be.empty
          res.body.should.have.property('users')
          res.body.users.should.have.property('id')
          res.body.users.id.should.eql(user.id)
          done()
        })
    })

    it('should not sign in with an invalid user', (done) => {
      request
        .post(`${app.context.config.host}/v1/session`)
        .send({ username: 'username', password: userData.password })
        .end((err, res) => {
          res.should.not.be.empty
          res.body.err.should.not.be.empty
          res.body.should.have.property('err')
          res.body.err.should.equal('We could not find the nickname you provided.')
          done()
        })
    })

    it('should not sign in with an invalid password', (done) => {
      request
        .post(`${app.context.config.host}/v1/session`)
        .send({ username: userData.username, password: 'wrong' })
        .end((err, res) => {
          res.should.not.be.empty
          res.body.err.should.not.be.empty
          res.body.should.have.property('err')
          res.body.err.should.equal('The password you provided does not match the password in our system.')
          done()
        })
    })

    it('should not sign in with missing username', async () => {
      const result = await fetch(`${app.context.config.host}/v1/session`, { method: 'POST', body: 'a=1' })
      const data = await result.json()

      data.should.not.have.property('authToken')
      data.should.have.property('err')
    })
  })
})

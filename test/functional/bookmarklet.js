/* eslint-env node, mocha */
/* global $pg_database */
import knexCleaner from 'knex-cleaner'
import { getSingleton } from '../../app/app'
import { DummyPublisher } from '../../app/pubsub'
import { PubSub } from '../../app/models'
import { createUserAsync, createPostViaBookmarklet, createGroupAsync } from './functional_test_helper'


describe('BookmarkletController', () => {
  before(async () => {
    await getSingleton()
    PubSub.setPublisher(new DummyPublisher())
  })

  beforeEach(async () => {
    await knexCleaner.clean($pg_database)
  })

  describe('#create()', () => {
    let luna

    beforeEach(async () => {
      luna = await createUserAsync('Luna', 'password')
    })

    it('should create posts without attachments', async () => {
      const response = await createPostViaBookmarklet(luna, 'Hello, world!')
      response.status.should.eql(200)

      const responseData = await response.json()
      responseData.should.have.property('posts')
      responseData.should.have.property('subscriptions')
      responseData.subscriptions.should.have.length(1)
    })

    it('should allow create posts in multiple feeds', async () => {
      const group = await createGroupAsync(luna, 'new-shiny-group')

      const response = await createPostViaBookmarklet(luna, 'Hello, world!', null, null, [luna.username, group.username])
      response.status.should.eql(200)

      const responseData = await response.json()

      responseData.should.have.property('posts')
      responseData.should.have.property('subscriptions')
      responseData.subscriptions.should.have.length(2)
    })

    it('should force an error when trying to post into nonexistent groups', async () => {
      const response = await createPostViaBookmarklet(luna, 'Hello, world!', null, null, [luna.username, 'non-existent-group'])
      response.status.should.eql(404)

      const responseData = await response.json()

      responseData.should.have.property('err')
    })
  })
})

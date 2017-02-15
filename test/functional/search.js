/* eslint-env node, mocha */
/* global $pg_database */
import knexCleaner from 'knex-cleaner'

import { getSingleton } from '../../app/app'
import { DummyPublisher } from '../../app/pubsub'
import { PubSub } from '../../app/models'
import * as funcTestHelper from './functional_test_helper'

describe('SearchController', () => {
  before(async () => {
    await getSingleton()
    PubSub.setPublisher(new DummyPublisher())
  })

  beforeEach(async () => {
    await knexCleaner.clean($pg_database)
  })

  describe('#create()', () => {
    let lunaContext = {}
    let marsContext = {}
    const anonContext = {}

    beforeEach(async () => {
      [lunaContext, marsContext] = await Promise.all([
        funcTestHelper.createUserAsync('luna', 'pw'),
        funcTestHelper.createUserAsync('mars', 'pw')
      ])
      await Promise.all([
        funcTestHelper.createPostWithCommentsDisabled(lunaContext, 'hello from luna', false),
        funcTestHelper.createPostWithCommentsDisabled(lunaContext, '#hashTagA from luna', false),
        funcTestHelper.createPostWithCommentsDisabled(marsContext, 'hello from mars', false)
      ])
      await funcTestHelper.createPostWithCommentsDisabled(lunaContext, '#hashtaga from luna again', false)
    })

    it('should search posts', async () => {
      const response = await funcTestHelper.performSearch(anonContext, 'hello')
      response.should.not.be.empty
      response.should.have.property('posts')
      response.posts.length.should.be.eql(2)
    })

    it('should search user\'s posts', async () => {
      const response = await funcTestHelper.performSearch(anonContext, 'from:luna hello')
      response.should.not.be.empty
      response.should.have.property('posts')
      response.posts.length.should.be.eql(1)
      response.posts[0].body.should.be.eql('hello from luna')
    })

    it('should search own posts with from:me', async () => {
      const response = await funcTestHelper.performSearch(lunaContext, 'from:me hello')
      response.should.not.be.empty
      response.should.have.property('posts')
      response.posts.length.should.be.eql(1)
      response.posts[0].body.should.be.eql('hello from luna')
    })

    it('should not search anonymously with from:me', async () => {
      const response = await funcTestHelper.performSearch(anonContext, 'from:me hello')
      response.should.not.be.empty
      response.should.have.property('err')
    })

    it('should search hashtags with different casing', async () => {
      const response = await funcTestHelper.performSearch(anonContext, '#hashtaga')
      response.should.not.be.empty
      response.should.have.property('posts')
      response.posts.length.should.be.eql(2)
    })

    it('should return first page with isLastPage = false', async () => {
      const response = await funcTestHelper.performSearch(anonContext, 'from luna', { limit: 2, offset: 0 })
      response.should.not.be.empty
      response.should.have.property('isLastPage')
      response.isLastPage.should.be.eql(false)
    })

    it('should return last page with isLastPage = true', async () => {
      const response = await funcTestHelper.performSearch(anonContext, 'from luna', { limit: 2, offset: 2 })
      response.should.not.be.empty
      response.should.have.property('isLastPage')
      response.isLastPage.should.be.eql(true)
    })

    it('should return the only page with isLastPage = true', async () => {
      const response = await funcTestHelper.performSearch(anonContext, 'from luna')
      response.should.not.be.empty
      response.should.have.property('isLastPage')
      response.isLastPage.should.be.eql(true)
    })
  })
});

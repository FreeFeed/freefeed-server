/*eslint-env node, mocha */
/*global $database */
import { getSingleton } from '../../app/app'
import { createUserAsync, createPostViaBookmarklet, createGroupAsync } from './functional_test_helper'


describe('BookmarkletController', () => {
  let app

  beforeEach(async () => {
    app = await getSingleton()
    await $database.flushdbAsync()
  })

  describe('#create()', () => {
    let luna

    beforeEach(async () => {
      luna = await createUserAsync('Luna', 'password')
    })

    it('should create posts without attachments', async () => {
      let response = await createPostViaBookmarklet(luna, 'Hello, world!')
      response.status.should.eql(200)

      let responseData = await response.json()
      responseData.should.have.property('posts')
      responseData.should.have.property('subscriptions')
      responseData.subscriptions.should.have.length(1)
    })

    it('should allow create posts in multiple feeds', async () => {
      let group = await createGroupAsync(luna, 'new-shiny-group')

      let response = await createPostViaBookmarklet(luna, 'Hello, world!', null, null, [luna.username, group.username])
      response.status.should.eql(200)

      let responseData = await response.json()

      responseData.should.have.property('posts')
      responseData.should.have.property('subscriptions')
      responseData.subscriptions.should.have.length(2)
    })

    it('should force an error when trying to post into nonexistent groups', async () => {
      let response = await createPostViaBookmarklet(luna, 'Hello, world!', null, null, [luna.username, 'non-existent-group'])
      response.status.should.eql(404)

      let responseData = await response.json()

      responseData.should.have.property('err')
    })
  })
})

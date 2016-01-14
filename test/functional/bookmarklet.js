/*eslint-env node, mocha */
/*global $database */
import { getSingleton } from '../../app/app'
import { createUserAsync, createPostViaBookmarklet } from './functional_test_helper'


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
    })
  })
})

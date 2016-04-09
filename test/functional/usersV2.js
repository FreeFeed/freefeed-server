/*eslint-env node, mocha */
/*global $database */
import fetch from 'node-fetch'
import request from 'superagent'

import { getSingleton } from '../../app/app'
import { createUserAsync } from '../functional/functional_test_helper'


describe("UsersControllerV2", function() {
  let app

  beforeEach(async () => {
    app = await getSingleton()
    await $database.flushdbAsync()
  })

  describe("#blockedByMe()", function() {

    it('should reject unauthenticated users', async done => {
      request
        .get(app.config.host + '/v2/users/blockedByMe')
        .end( err => {
          err.should.not.be.empty
          err.status.should.eql(401)
          done()
        })
    })

    it('should return list for authenticated user', async done => {
      const userA = {
        username: 'Luna',
        password: 'password'
      }

      const userB = {
        username: 'Mars',
        password: 'password'
      }


      const userAResponse = await createUserAsync(userA.username, userA.password)

      const userBResponse = await createUserAsync(userB.username, userB.password)

      await fetch(`${app.config.host}/v1/users/${userB.username}/ban`, {
        method: 'POST',
        headers: {
          'X-Authentication-Token': userAResponse.authToken
        }
      })

      const blockedByMeResponse = await fetch(`${app.config.host}/v2/users/blockedbyme`,{
        headers: {
          'X-Authentication-Token': userAResponse.authToken
        }
      })

      const blockedByMe = await blockedByMeResponse.json()

      blockedByMe.should.not.be.empty
      blockedByMe.length.should.eql(1)
      blockedByMe[0].should.have.property('id')
      blockedByMe[0].id.should.eql(userBResponse.user.id)
      blockedByMe[0].should.have.property('username')
      blockedByMe[0].username.should.eql(userB.username.toLowerCase())
      blockedByMe[0].should.have.property('screenName')
      blockedByMe[0].should.have.property('profilePictureLargeUrl')
      blockedByMe[0].should.have.property('profilePictureMediumUrl')

      done()
    })
  })

})


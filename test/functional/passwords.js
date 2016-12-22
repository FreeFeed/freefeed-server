/* eslint-env node, mocha */
/* global $pg_database */
import knexCleaner from 'knex-cleaner'

import { getSingleton } from '../../app/app'
import { DummyPublisher } from '../../app/pubsub'
import { PubSub } from '../../app/models'
import * as funcTestHelper from './functional_test_helper'


describe('PasswordsController', () => {
  before(async () => {
    await getSingleton()
    PubSub.setPublisher(new DummyPublisher())
  })

  beforeEach(async () => {
    await knexCleaner.clean($pg_database)
  })

  describe('#create()', () => {
    let context = {}
    const oldEmail = 'test@example.com'

    beforeEach(async () => {
      context = await funcTestHelper.createUserAsync('Luna', 'password', { 'email': oldEmail })
    })

    it('should require email', async () => {
      const response = await funcTestHelper.sendResetPassword('')
      response.status.should.equal(400)

      const data = await response.json()
      data.should.have.property('err')
      data.err.should.eql('Email cannot be blank')
    })

    it('should generate resetToken by original email of user', async () => {
      const response = await funcTestHelper.sendResetPassword(oldEmail)
      response.status.should.equal(200)

      const data = await response.json()
      data.should.have.property('message')
      data.message.should.eql(`Password reset link has been sent to ${oldEmail}`)
    })

    it('should generate resetToken by new email of user', async () => {
      const email = 'luna@example.com'

      await funcTestHelper.updateUserAsync(context, { email })

      const errResponse = await funcTestHelper.sendResetPassword(oldEmail)
      errResponse.status.should.equal(404)

      const response = await funcTestHelper.sendResetPassword(email)
      response.status.should.equal(200, `failed to reset password for ${email} email`)

      const data = await response.json()
      data.should.have.property('message')
      data.message.should.eql(`Password reset link has been sent to ${email}`)
    })

    it('should generate resetToken by email with capital letters', async () => {
      const email = 'Luna@example.com'

      await funcTestHelper.updateUserAsync(context, { email })

      const response = await funcTestHelper.sendResetPassword(email)
      response.status.should.equal(200, `failed to reset password for ${email} email`)

      const data = await response.json()
      data.should.have.property('message')
      data.message.should.eql(`Password reset link has been sent to ${email}`)
    })
  })

  describe('#update()', () => {
    let context = {}
    const email = 'luna@example.com'

    beforeEach(async () => {
      context = await funcTestHelper.createUserAsync('Luna', 'password')
      await funcTestHelper.updateUserAsync(context, { email })
      await funcTestHelper.sendResetPassword(email)
    })

    it('should not reset password by invalid resetToken', (done) => {
      funcTestHelper.resetPassword('token')((err, res) => {
        res.body.should.not.be.empty
        res.body.should.have.property('err')
        res.body.err.should.eql('Password reset token not found or has expired')
        done()
      })
    })
  })
})

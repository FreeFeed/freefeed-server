/* eslint-env node, mocha */
/* global $pg_database */
import knexCleaner from 'knex-cleaner'
import { dbAdapter, User, Group } from '../../app/models'


describe('Group', () => {
  beforeEach(async () => {
    await knexCleaner.clean($pg_database)
  })

  describe('#create()', () => {
    let groupAdmin
    beforeEach(async () => {
      groupAdmin = new User({
        username: 'Pluto',
        password: 'password'
      })

      await groupAdmin.create()
    })

    it('should create without error', (done) => {
      const group = new Group({ username: 'FriendFeed' })
      const ownerId = groupAdmin.id

      group.create(ownerId)
        .then((group) => {
          group.should.be.an.instanceOf(Group)
          group.should.not.be.empty
          group.should.have.property('id')

          return group
        })
        .then((group) => dbAdapter.getGroupById(group.id))
        .then((newGroup) => {
          newGroup.should.be.an.instanceOf(Group)
          newGroup.should.not.be.empty
          newGroup.should.have.property('id')
          newGroup.id.should.eql(group.id)
          newGroup.should.have.property('type')
          newGroup.type.should.eql('group')

          return dbAdapter.getGroupByUsername(group.username)
        })
        .then((groupByName) => {
          groupByName.id.should.eql(group.id)
          groupByName.should.be.an.instanceOf(Group)
          return groupByName.getAdministratorIds()
        })
        .then((adminIds) => {
          adminIds.should.contain(ownerId)
          done()
        })
        .catch((e) => { done(e) })
    })

    it('should create with null screenName', (done) => {
      const group = new Group({
        username:   'username',
        screenName: null
      })

      group.create()
        .then((newGroup) => {
          newGroup.should.be.an.instanceOf(Group)
          newGroup.should.not.be.empty
          newGroup.should.have.property('id')
          newGroup.id.should.eql(group.id)
          newGroup.should.have.property('type')
          newGroup.type.should.eql('group')
          group.should.have.property('screenName')
          newGroup.screenName.should.eql(group.username)
          done()
        })
        .catch((e) => { done(e) })
    })

    it('should not create with tiny screenName', async () => {
      const group = new Group({
        username:   'FriendFeed',
        screenName: 'a'
      })

      try {
        await group.create()
      } catch (e) {
        e.message.should.eql(`"${group.screenName}" is not a valid display name. Names must be between 3 and 25 characters long.`)
        return
      }

      throw new Error(`FAIL (screenname "a" should not be valid)`)
    })

    it('should not create with username that already exists', (done) => {
      const groupA = new Group({
        username:   'FriendFeedA',
        screenName: 'FriendFeedA'
      })

      const groupB = new Group({
        username:   'FriendFeedA',
        screenName: 'FriendFeedB'
      })

      groupA.create()
        .then(() => { return groupB.create() })
        .then(() => { done(new Error('Creted group with existing username')) })
        .catch((e) => {
          e.message.should.eql('Already exists')
          done()
        })
    })
  })

  describe('#update()', () => {
    it('should update without error', async () => {
      const screenName = 'Pepyatka'
      const group = new Group({ username: 'FriendFeed' })

      await group.create()

      group.should.be.an.instanceOf(Group)
      group.should.not.be.empty
      group.should.have.property('id')
      group.should.have.property('screenName')

      await group.update({ screenName })

      group.should.be.an.instanceOf(Group)
      group.should.not.be.empty
      group.should.have.property('id')
      group.id.should.eql(group.id)
      group.should.have.property('type')
      group.type.should.eql('group')
      group.should.have.property('screenName')
      group.screenName.should.eql(screenName)
    })

    it('should update without screenName', (done) => {
      const screenName = 'Luna'
      const group = new Group({
        username: 'Luna',
        screenName
      })

      group.create()
        .then((group) => group.update({}))
        .then((newGroup) => {
          newGroup.should.be.an.instanceOf(Group)
          newGroup.should.not.be.empty
          newGroup.should.have.property('id')
          newGroup.screenName.should.eql(screenName)
          done()
        })
        .catch((e) => { done(e) })
    })
  })

  describe('#isValidUsername()', () => {
    const valid = [
      'luna', 'lun', '12345', 'hello1234', 'save-our-snobs',
      ' group', 'group ',  // automatically trims
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'  // 35 chars is ok
    ]
    valid.forEach((username) => {
      it(`should allow username ${username}`, async () => {
        const group = new Group({
          username,
          screenName: 'test'
        })

        await group.create();
        (await group.isValidEmail()).should.eql(true)
      })
    })

    const invalid = [
      'lu', '-12345', 'luna-', 'hel--lo', 'абизьян', 'gr oup',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'  // 36 chars is 1 char too much
    ]
    invalid.forEach((username) => {
      it(`should not allow invalid username ${username}`, async () => {
        const group = new Group({
          username,
          screenName: 'test'
        })

        try {
          await group.create()
        } catch (e) {
          e.message.should.eql('Invalid username')
          return
        }

        throw new Error(`FAIL (username "${username}" should not be valid)`)
      })
    })
  })

  describe('addAdministrator', () => {
    let group
      , groupAdmin
    beforeEach(async () => {
      groupAdmin = new User({
        username: 'Pluto',
        password: 'password'
      })

      await groupAdmin.create()

      group = new Group({
        username:   'Luna',
        screenName: 'Moon'
      })
      await group.create()
    })

    it('should add an administrator', (done) => {
      group.addAdministrator(groupAdmin.id)
        .then(() => group.getAdministratorIds())
        .then((res) => {
          res.should.contain(groupAdmin.id)
          done()
        })
        .catch((e) => { done(e) })
    })
  })

  describe('removeAdministrator', () => {
    let group
      , groupAdmin
      , secondGroupAdmin

    beforeEach(async () => {
      groupAdmin = new User({
        username: 'Pluto',
        password: 'password'
      })

      await groupAdmin.create()

      secondGroupAdmin = new User({
        username: 'Jupiter',
        password: 'password'
      })

      await secondGroupAdmin.create()

      group = new Group({
        username:   'Luna',
        screenName: 'Moon'
      })
      await group.create(groupAdmin.id)
      await group.addAdministrator(secondGroupAdmin.id)
    })

    it('should remove an administrator', (done) => {
      group.removeAdministrator(groupAdmin.id)
        .then(() => group.getAdministratorIds())
        .then((res) => {
          res.length.should.eql(1)
          done()
        })
        .catch((e) => { done(e) })
    })

    it('should refuse to remove the last administrator', (done) => {
      group.removeAdministrator(secondGroupAdmin.id)
        .then(() => group.removeAdministrator(groupAdmin.id))
        .catch((e) => {
          e.message.should.eql('Cannot remove last administrator')
          done()
        })
    })
  })
})

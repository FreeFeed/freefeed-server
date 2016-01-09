import { Group, FeedFactory, User } from '../../app/models'


describe('FeedFactory', function() {
  beforeEach(function(done) {
    $database.flushdbAsync()
      .then(function() { done() })
  })

  describe('#findById()', function() {
    it('should find user with a valid id', function(done) {
      var user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(function(user) { return FeedFactory.findById(user.id) })
        .then(function(newUser) {
          newUser.should.be.an.instanceOf(User)
          newUser.should.not.be.empty
          newUser.should.have.property('id')
          newUser.id.should.eql(user.id)

          done()
        })
    })
  })

  describe('#findByName()', function() {
    it('should find user with a valid name', function(done) {
      var user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(function(user) { return FeedFactory.findByUsername(user.username) })
        .then(function(newUser) {
          newUser.should.be.an.instanceOf(User)
          newUser.should.not.be.empty
          newUser.should.have.property('id')
          newUser.id.should.eql(user.id)

          done()
        })
    })

    it('should find group with a valid name', async () => {
      var group = new Group({
        username: 'Luna'
      })

      await group.create()

      let newGroup = await FeedFactory.findByUsername(group.username)

      newGroup.should.be.an.instanceOf(Group)
      newGroup.should.not.be.empty
      newGroup.should.have.property('id')
      newGroup.id.should.eql(group.id)
    })
  })
})

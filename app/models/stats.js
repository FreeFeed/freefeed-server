export function addModel(dbAdapter) {
  var Stats = function(params) {
    this.id = params.id
    this.posts = params.posts || 0
    this.likes = params.likes || 0
    this.comments = params.comments || 0
    this.subscribers = params.subscribers || 0
    this.subscriptions = params.subscriptions || 0
  }

  Stats.className = Stats
  Stats.namespace = "stats"

  Stats.prototype.validateOnCreate = async function() {
    const valid = this.id
               && this.id.length > 0

    if (!valid)
      throw new Error("Invalid")

    const userExists = (1 == await dbAdapter.existsUser(this.id))

    if (!userExists)
      throw new Error("No user = No stats")
  }

  Stats.prototype.create = async function() {
    await this.validateOnCreate()

    const payload = {
      'posts':         this.posts.toString(),
      'likes':         this.likes.toString(),
      'comments':      this.comments.toString(),
      'subscribers':   this.subscribers.toString(),
      'subscriptions': this.subscriptions.toString()
    }

    return Promise.all([
      dbAdapter.createUserStats(this.id, payload),
      dbAdapter.addUserLikesStats(this.id, this.likes),
      dbAdapter.addUserPostsStats(this.id, this.posts),
      dbAdapter.addUserCommentsStats(this.id, this.comments),
      dbAdapter.addUserSubscribersStats(this.id, this.subscribers),
      dbAdapter.addUserSubscriptionsStats(this.id, this.subscriptions)
    ])
  }

  Stats.prototype.changeProperty = async function(property, value) {
    await dbAdapter.changeUserStatsValue(this.id, property, value)
    return dbAdapter.changeUserStats(this.id, property, value)
  }

  Stats.prototype.incrementProperty = function(property) {
    return this.changeProperty(property, 1)
  }

  Stats.prototype.decrementProperty = function(property) {
    return this.changeProperty(property, -1)
  }

  Stats.prototype.addPost = function() {
    return this.incrementProperty('posts')
  }

  Stats.prototype.removePost = function() {
    return this.decrementProperty('posts')
  }

  Stats.prototype.addLike = function() {
    return this.incrementProperty('likes')
  }

  Stats.prototype.removeLike = function() {
    return this.decrementProperty('likes')
  }

  Stats.prototype.addComment = function() {
    return this.incrementProperty('comments')
  }

  Stats.prototype.removeComment = function() {
    return this.decrementProperty('comments')
  }

  Stats.prototype.addSubscriber = function() {
    return this.incrementProperty('subscribers')
  }

  Stats.prototype.removeSubscriber = function() {
    return this.decrementProperty('subscribers')
  }

  Stats.prototype.addSubscription = function() {
    return this.incrementProperty('subscriptions')
  }

  Stats.prototype.removeSubscription = function() {
    return this.decrementProperty('subscriptions')
  }

  return Stats
}

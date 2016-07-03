import _ from 'lodash'

export class DataTransfer{
  constructor(pgAdapter, redis) {
    this.pgAdapter = pgAdapter
    this.redis = redis

    this.writeUsers                 = false
    this.writeSubscriptionRequests  = false
    this.writeBans                  = false
    this.writeAdmins                = false
    this.writeUserFeeds             = false
    this.writeGroupFeeds            = false
    this.writeSubscriptions         = false
    this.writePosts                 = false
    this.writeAttachments           = false
    this.writeComments              = false
    this.writeLikes                 = false
  }

  async run(pgAdapter, redis){
    this.userKeys = await this.redis.keysAsync("user:????????????????????????????????????")

    this.userIds = await this._transferUsers()

    await this._transferSubscriptionRequests()

    await this._transferBans()

    await this._transferGroupAdmins()

    await this._transferFeeds()

    await this._transferSubscriptions()

    this.postKeys = await this.redis.keysAsync("post:????????????????????????????????????")

    this.postIds = await this._transferPosts()

    this.attachmentKeys = await this.redis.keysAsync("attachment:????????????????????????????????????")

    this.attachmentIds = await this._transferAttachments()

    this.commentKeys = await this.redis.keysAsync("comment:????????????????????????????????????")

    this.commentIds = await this._transferComments()

    await this._transferLikes()
  }

  async _transferUsers(){
    let userIds = []
    for (let k of this.userKeys){
      const userId = k.substr(5)

      console.log("Processing user", userId)

      const userHash = await this.redis.hgetallAsync(k)
      userHash.id = userId

      if( this.writeUsers ) {
        await this.pgAdapter.createUser(userHash)
      }

      userIds.push(userId)
    }
    return userIds
  }

  async _transferSubscriptionRequests(){
    for (let id of this.userIds){
      console.log("Processing subscription requests for user", id)

      let requestsRaw = await this.redis.zrangeAsync(`user:${id}:requests`, 0, -1, 'WITHSCORES')
      let requests = _.chunk(requestsRaw, 2)
      for (let r of requests){
        console.log(r[0], id, r[1])
        if(this.writeSubscriptionRequests){
          await this.pgAdapter.createSubscriptionRequest(r[0], id, r[1])
        }
      }
    }
  }

  async _transferBans(){
    for (let id of this.userIds){
      console.log("Processing bans for user", id)

      let bansRaw = await this.redis.zrangeAsync(`user:${id}:bans`, 0, -1, 'WITHSCORES')
      let bans = _.chunk(bansRaw, 2)
      for (let b of bans){
        console.log(id, b[0], b[1])
        if(this.writeBans){
          await this.pgAdapter.createUserBan(id, b[0], b[1])
        }
      }
    }
  }

  async _transferGroupAdmins(){
    for (let id of this.userIds){
      console.log("Processing admins of user", id)

      let adminsRaw = await this.redis.zrangeAsync(`user:${id}:administrators`, 0, -1, 'WITHSCORES')
      let admins = _.chunk(adminsRaw, 2)
      for (let a of admins){
        console.log(id, a[0], a[1])
        if(this.writeAdmins){
          await this.pgAdapter.addAdministratorToGroup(id, a[0], a[1])
        }
      }
    }
  }

  async _transferFeeds(){
    for (let id of this.userIds){
      const user = await this.redis.hgetallAsync(`user:${id}`)
      if (user.type === 'user') {
        await this._transferUserFeeds(id)
      } else {
        await this._transferGroupFeeds(id)
      }
    }
  }

  async _transferUserFeeds(id){
    console.log("Processing feeds of user", id)

    let requiredFeedIds = {
      'RiverOfNews':   null,
      'Hides':         null,
      'Comments':      null,
      'Likes':         null,
      'Posts':         null,
      'Directs':       null,
      'MyDiscussions': null
    }

    let userFeedIds = await this.redis.hgetallAsync(`user:${id}:timelines`)
    _.merge(requiredFeedIds, userFeedIds)

    return Promise.all(_.map(requiredFeedIds, async (feedId, feedName)=>{
      let feed = {
        name: feedName,
        userId: id
      }
      if (feedId){
        feed = await this.redis.hgetallAsync(`timeline:${feedId}`)
        feed.id = feedId
      }
      if(this.writeUserFeeds){
        await this.pgAdapter.createTimeline(feed)
      }
    }))
  }

  async _transferGroupFeeds(id){
    console.log("Processing feeds of group", id)

    let requiredFeedIds = {
      'RiverOfNews':   null,
      'Hides':         null,
      'Comments':      null,
      'Likes':         null,
      'Posts':         null
    }

    let groupFeedIds = await this.redis.hgetallAsync(`user:${id}:timelines`)
    _.merge(requiredFeedIds, groupFeedIds)

    return Promise.all(_.map(requiredFeedIds, async (feedId, feedName)=>{
      let feed = {
        name: feedName,
        userId: id
      }
      if (feedId){
        feed = await this.redis.hgetallAsync(`timeline:${feedId}`)
        feed.id = feedId
      }
      if(this.writeGroupFeeds){
        await this.pgAdapter.createTimeline(feed)
      }
    }))
  }

  async _transferSubscriptions(){
    for (let id of this.userIds){
      console.log("Processing subscriptions of user", id)

      let subsRaw = await this.redis.zrangeAsync(`user:${id}:subscriptions`, 0, -1, 'WITHSCORES')
      let subs = _.chunk(subsRaw, 2)
      for (let s of subs){
        console.log(id, s[0], s[1])
        if(this.writeSubscriptions){
          await this.pgAdapter.subscribeUserToTimeline(s[0], id, s[1])
        }
      }
    }
  }

  async _transferPosts(){
    let postIds = []
    for (let k of this.postKeys){
      const postId = k.substr(5)

      console.log("Processing post", postId)

      const postHash = await this.redis.hgetallAsync(k)
      postHash.id = postId
      const authorId = postHash.userId
      if (authorId && _.includes(this.userIds, authorId)) {

        const postDestinations = await this.redis.smembersAsync(`post:${postId}:to`)
        const postUsages       = await this.redis.smembersAsync(`post:${postId}:timelines`)

        if (this.writePosts) {
          await this.pgAdapter.createPost(postHash, postDestinations, postUsages)
        }

        postIds.push(postId)
      } else {
        console.log("Found post without author", postHash)
      }
    }
    return postIds
  }

  async _transferAttachments(){
    let attachmentIds = []
    for (let k of this.attachmentKeys){
      const attachmentId = k.substr(11)

      console.log("Processing attachment", attachmentId)

      const attachmentHash = await this.redis.hgetallAsync(k)
      attachmentHash.id = attachmentId

      if( this.writeAttachments ) {
        await this.pgAdapter.createAttachment(attachmentHash)
      }

      attachmentIds.push(attachmentId)
    }
    return attachmentIds
  }

  async _transferComments(){
    let commentIds = []
    for (let k of this.commentKeys){
      const commentId = k.substr(8)

      console.log("Processing comment", commentId)

      const commentHash = await this.redis.hgetallAsync(k)
      commentHash.id = commentId

      console.log(commentHash)

      if( this.writeComments ) {
        await this.pgAdapter.createComment(commentHash)
      }

      commentIds.push(commentId)
    }
    return commentIds
  }

  async _transferLikes(){
    for (let id of this.postIds){
      console.log("Processing likes of post", id)

      let likesRaw = await this.redis.zrangeAsync(`post:${id}:likes`, 0, -1, 'WITHSCORES')
      let likes = _.chunk(likesRaw, 2)
      for (let like of likes){
        console.log(id, like[0], like[1])
        if(this.writeLikes){
          await this.pgAdapter.createUserPostLike(id, like[0], like[1])
        }
      }
    }
  }
}

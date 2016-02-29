import { dbAdapter } from './models'


export default class pubSub {
  publisher;

  constructor(publisher) {
    this.publisher = publisher
  }

  async newPost(postId) {
    var post = await dbAdapter.getPostById(postId)
    var timelines = await post.getTimelines()

    var promises = timelines.map(async (timeline) => {
      let isBanned = await post.isBannedFor(timeline.userId)

      if (!isBanned) {
        let payload = JSON.stringify({ postId, timelineId: timeline.id })
        await this.publisher.postCreated(payload)
      }
    })

    await Promise.all(promises)
  }

  async destroyPost(postId, timelineIds) {
    var promises = timelineIds.map(async (timelineId) => {
      let jsonedPost = JSON.stringify({ postId, timelineId })
      await this.publisher.postDestroyed(jsonedPost)
    })

    await Promise.all(promises)
  }

  async updatePost(postId) {
    var post = await dbAdapter.getPostById(postId)
    var timelineIds = await post.getTimelineIds()

    var promises = timelineIds.map(async (timelineId) => {
      let jsonedPost = JSON.stringify({ postId, timelineId })
      await this.publisher.postUpdated(jsonedPost)
    })

    await Promise.all(promises)

    let payload = JSON.stringify({ postId})
    await this.publisher.postUpdated(payload)
  }

  async newComment(comment, timelines) {
    let post = await comment.getPost()
    let promises = timelines.map(async (timeline) => {
      if (await post.isHiddenIn(timeline))
        return

      let payload = JSON.stringify({ timelineId: timeline.id, commentId: comment.id })
      await this.publisher.commentCreated(payload)
    })

    await Promise.all(promises)

    let payload = JSON.stringify({ postId: post.id, commentId: comment.id })
    await this.publisher.commentCreated(payload)
  }

  async destroyComment(commentId, postId) {
    var post = await dbAdapter.getPostById(postId)
    let payload = JSON.stringify({ postId, commentId })
    await this.publisher.commentDestroyed(payload)

    var timelineIds = await post.getTimelineIds()
    var promises = timelineIds.map(async (timelineId) => {
      let payload = JSON.stringify({postId,  timelineId, commentId })
      await this.publisher.commentDestroyed(payload)
    })

    await Promise.all(promises)
  }

  async updateComment(commentId) {
    var comment = await dbAdapter.getCommentById(commentId)
    var post = await comment.getPost()

    let payload = JSON.stringify({ postId: post.id, commentId })
    await this.publisher.commentUpdated(payload)

    var timelineIds = await post.getTimelineIds()
    var promises = timelineIds.map(async (timelineId) => {
      let payload = JSON.stringify({ timelineId, commentId })
      await this.publisher.commentUpdated(payload)
    })

    await Promise.all(promises)
  }

  async newLike(post, userId, timelines) {
    var promises = timelines.map(async (timeline) => {
      // no need to notify users about updates to hidden posts
      if (await post.isHiddenIn(timeline))
        return

      let payload = JSON.stringify({ timelineId: timeline.id, userId, postId: post.id })
      await this.publisher.likeAdded(payload)
    })

    await Promise.all(promises)

    let payload = JSON.stringify({ userId, postId: post.id })
    await this.publisher.likeAdded(payload)
  }

  async removeLike(postId, userId) {
    var post = await dbAdapter.getPostById(postId)
    var timelineIds = await post.getTimelineIds()

    var promises = timelineIds.map(async (timelineId) => {
      let payload = JSON.stringify({ timelineId, userId, postId })
      await this.publisher.likeRemoved(payload)
    })

    await Promise.all(promises)

    let payload = JSON.stringify({ userId, postId })
    await this.publisher.likeRemoved(payload)
  }

  async hidePost(userId, postId) {
    var user = await dbAdapter.getUserById(userId)
    var timelineId = await user.getRiverOfNewsTimelineId()

    var payload = JSON.stringify({ timelineId, postId })
    await this.publisher.postHidden(payload)
  }

  async unhidePost(userId, postId) {
    var user = await dbAdapter.getUserById(userId)
    var timelineId = await user.getRiverOfNewsTimelineId()

    var payload = JSON.stringify({ timelineId, postId })
    await this.publisher.postUnhidden(payload)
  }
}

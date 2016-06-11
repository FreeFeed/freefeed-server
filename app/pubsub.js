import { dbAdapter } from './models'


export default class pubSub {
  constructor(publisher) {
    this.publisher = publisher
  }

  async newPost(postId) {
    let payload = JSON.stringify({ postId })
    await this.publisher.postCreated(payload)
  }

  async destroyPost(postId, timelineIds) {
    var promises = timelineIds.map(async (timelineId) => {
      let jsonedPost = JSON.stringify({ postId, timelineId })
      await this.publisher.postDestroyed(jsonedPost)
    })

    await Promise.all(promises)
  }

  async updatePost(postId) {
    let payload = JSON.stringify({ postId})
    await this.publisher.postUpdated(payload)
  }

  async newComment(comment, timelines) {
    let timelineIds = timelines.map((t)=>t.id)
    let payload = JSON.stringify({ commentId: comment.id, timelineIds })
    await this.publisher.commentCreated(payload)
  }

  async destroyComment(commentId, postId) {
    let payload = JSON.stringify({ postId, commentId })
    await this.publisher.commentDestroyed(payload)
  }

  async updateComment(commentId) {
    let payload = JSON.stringify({ commentId })
    await this.publisher.commentUpdated(payload)
  }

  async newLike(post, userId, timelines) {
    let timelineIds = timelines.map((t)=>t.id)
    let payload = JSON.stringify({ userId, postId: post.id, timelineIds })
    await this.publisher.likeAdded(payload)
  }

  async removeLike(postId, userId) {
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

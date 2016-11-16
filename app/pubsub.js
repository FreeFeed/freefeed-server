import { dbAdapter } from './models'


export class DummyPublisher {
  userUpdated() {}
  postCreated() {}
  postDestroyed() {}
  postUpdated() {}
  commentCreated() {}
  commentDestroyed() {}
  commentUpdated() {}
  likeAdded() {}
  likeRemoved() {}
  postHidden() {}
  postUnhidden() {}
}

export default class pubSub {
  constructor(publisher) {
    this.publisher = publisher
  }

  setPublisher(publisher) {
    this.publisher = publisher;
  }

  async updateUnreadDirects(userId) {
    const unreadDirectsNumber = await dbAdapter.getUnreadDirectsNumber(userId);
    const user = { id: userId, unreadDirectsNumber };
    const payload = JSON.stringify({ user });
    await this.publisher.userUpdated(payload);
  }

  async newPost(postId) {
    const payload = JSON.stringify({ postId })
    await this.publisher.postCreated(payload)
  }

  async destroyPost(postId, timelineIds) {
    const promises = timelineIds.map(async (timelineId) => {
      const jsonedPost = JSON.stringify({ postId, timelineId })
      await this.publisher.postDestroyed(jsonedPost)
    })

    await Promise.all(promises)
  }

  async updatePost(postId) {
    const payload = JSON.stringify({ postId })
    await this.publisher.postUpdated(payload)
  }

  async newComment(comment, timelines) {
    const timelineIds = timelines.map((t) => t.id)
    const payload = JSON.stringify({ commentId: comment.id, timelineIds })
    await this.publisher.commentCreated(payload)
  }

  async destroyComment(commentId, postId) {
    const payload = JSON.stringify({ postId, commentId })
    await this.publisher.commentDestroyed(payload)
  }

  async updateComment(commentId) {
    const payload = JSON.stringify({ commentId })
    await this.publisher.commentUpdated(payload)
  }

  async newLike(post, userId, timelines) {
    const timelineIds = timelines.map((t) => t.id)
    const payload = JSON.stringify({ userId, postId: post.id, timelineIds })
    await this.publisher.likeAdded(payload)
  }

  async removeLike(postId, userId) {
    const payload = JSON.stringify({ userId, postId })
    await this.publisher.likeRemoved(payload)
  }

  async hidePost(userId, postId) {
    const user = await dbAdapter.getUserById(userId)
    const timelineId = await user.getRiverOfNewsTimelineId()

    const payload = JSON.stringify({ timelineId, postId })
    await this.publisher.postHidden(payload)
  }

  async unhidePost(userId, postId) {
    const user = await dbAdapter.getUserById(userId)
    const timelineId = await user.getRiverOfNewsTimelineId()

    const payload = JSON.stringify({ timelineId, postId })
    await this.publisher.postUnhidden(payload)
  }
}

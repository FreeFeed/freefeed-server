import { dbAdapter } from './models'
import { serializeUser } from './serializers/v2/user'


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
  commentLikeAdded() {}
  commentLikeRemoved() {}
  globalUserUpdated() {}
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

  async updateUnreadNotifications(userIntId) {
    const [{ uid: userId }] = await dbAdapter.getUsersIdsByIntIds([userIntId]);
    const unreadNotificationsNumber = await dbAdapter.getUnreadEventsNumber(userId);
    const user = { id: userId, unreadNotificationsNumber };
    const payload = JSON.stringify({ user });
    await this.publisher.userUpdated(payload);
  }

  async newPost(postId) {
    const payload = JSON.stringify({ postId })
    await this.publisher.postCreated(payload)
  }

  async destroyPost(postId, rooms) {
    const payload = JSON.stringify({ postId, rooms })
    await this.publisher.postDestroyed(payload)
  }

  async updatePost(postId) {
    const payload = JSON.stringify({ postId })
    await this.publisher.postUpdated(payload)
  }

  async newComment(comment) {
    const payload = JSON.stringify({ commentId: comment.id })
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

  async newLike(post, userId) {
    const payload = JSON.stringify({ userId, postId: post.id })
    await this.publisher.likeAdded(payload)
  }

  async removeLike(postId, userId, rooms) {
    const payload = JSON.stringify({ userId, postId, rooms })
    await this.publisher.likeRemoved(payload)
  }

  async hidePost(userId, postId) {
    await this.publisher.postHidden(JSON.stringify({ userId, postId }))
  }

  async unhidePost(userId, postId) {
    await this.publisher.postUnhidden(JSON.stringify({ userId, postId }))
  }

  async newCommentLike(commentId, postId, likerUUID) {
    const payload = JSON.stringify({ commentId, postId, likerUUID });
    await this.publisher.commentLikeAdded(payload);
  }

  async removeCommentLike(commentId, postId, unlikerUUID) {
    const payload = JSON.stringify({ commentId, postId, unlikerUUID });
    await this.publisher.commentLikeRemoved(payload);
  }

  async globalUserUpdate(userId) {
    const user = await dbAdapter.getUserById(userId);
    const payload = JSON.stringify(serializeUser(user));
    await this.publisher.globalUserUpdated(payload);
  }
}

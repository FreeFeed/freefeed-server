export const eventNames = {
  USER_UPDATE: 'user:update',
  POST_CREATED: 'post:new',
  POST_UPDATED: 'post:update',
  POST_DESTROYED: 'post:destroy',
  POST_HIDDEN: 'post:hide',
  POST_UNHIDDEN: 'post:unhide',
  POST_SAVED: 'post:save',
  POST_UNSAVED: 'post:unsave',
  COMMENT_CREATED: 'comment:new',
  COMMENT_UPDATED: 'comment:update',
  COMMENT_DESTROYED: 'comment:destroy',
  LIKE_ADDED: 'like:new',
  LIKE_REMOVED: 'like:remove',
  COMMENT_LIKE_ADDED: 'comment_like:new',
  COMMENT_LIKE_REMOVED: 'comment_like:remove',
  GLOBAL_USER_UPDATED: 'global:user:update',
  GROUP_TIMES_UPDATED: ':GROUP_TIMES_UPDATED',
};

export class PubSubAdapter {
  constructor(redisClient) {
    this.redisClient = redisClient;
  }

  ///////////////////////////////////////////////////

  userUpdated(payload) {
    return this._publish(eventNames.USER_UPDATE, payload);
  }

  ///////////////////////////////////////////////////

  postCreated(payload) {
    return this._publish(eventNames.POST_CREATED, payload);
  }

  postUpdated(payload) {
    return this._publish(eventNames.POST_UPDATED, payload);
  }

  postDestroyed(payload) {
    return this._publish(eventNames.POST_DESTROYED, payload);
  }

  postHidden(payload) {
    return this._publish(eventNames.POST_HIDDEN, payload);
  }

  postUnhidden(payload) {
    return this._publish(eventNames.POST_UNHIDDEN, payload);
  }

  postSaved(payload) {
    return this._publish(eventNames.POST_SAVED, payload);
  }

  postUnsaved(payload) {
    return this._publish(eventNames.POST_UNSAVED, payload);
  }

  ///////////////////////////////////////////////////

  commentCreated(payload) {
    return this._publish(eventNames.COMMENT_CREATED, payload);
  }

  commentUpdated(payload) {
    return this._publish(eventNames.COMMENT_UPDATED, payload);
  }

  commentDestroyed(payload) {
    return this._publish(eventNames.COMMENT_DESTROYED, payload);
  }

  ///////////////////////////////////////////////////

  likeAdded(payload) {
    return this._publish(eventNames.LIKE_ADDED, payload);
  }

  likeRemoved(payload) {
    return this._publish(eventNames.LIKE_REMOVED, payload);
  }

  ///////////////////////////////////////////////////

  commentLikeAdded(payload) {
    return this._publish(eventNames.COMMENT_LIKE_ADDED, payload);
  }

  commentLikeRemoved(payload) {
    return this._publish(eventNames.COMMENT_LIKE_REMOVED, payload);
  }

  ///////////////////////////////////////////////////

  globalUserUpdated(payload) {
    return this._publish(eventNames.GLOBAL_USER_UPDATED, payload);
  }

  groupTimesUpdated(payload) {
    return this._publish(eventNames.GROUP_TIMES_UPDATED, payload);
  }

  ///////////////////////////////////////////////////

  _publish(channel, payload) {
    return this.redisClient.publish(channel, payload);
  }
}

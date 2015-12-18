export class PubSubAdapter{
  static get CHANNEL_NAMES(){
    return {
      POST_CREATED:      'post:new',
      POST_UPDATED:      'post:update',
      POST_DESTROYED:    'post:destroy',
      POST_HIDDEN:       'post:hide',
      POST_UNHIDDEN:     'post:unhide',
      COMMENT_CREATED:   'comment:new',
      COMMENT_UPDATED:   'comment:update',
      COMMENT_DESTROYED: 'comment:destroy',
      LIKE_ADDED:        'like:new',
      LIKE_REMOVED:      'like:remove'
    }
  }

  constructor(database){
    this.database = database
  }

  ///////////////////////////////////////////////////

  async postCreated(payload){
    return this.publish(PubSubAdapter.CHANNEL_NAMES.POST_CREATED, payload)
  }

  async postUpdated(payload){
    return this.publish(PubSubAdapter.CHANNEL_NAMES.POST_UPDATED, payload)
  }

  async postDestroyed(payload){
    return this.publish(PubSubAdapter.CHANNEL_NAMES.POST_DESTROYED, payload)
  }

  async postHidden(payload){
    return this.publish(PubSubAdapter.CHANNEL_NAMES.POST_HIDDEN, payload)
  }

  async postUnhidden(payload){
    return this.publish(PubSubAdapter.CHANNEL_NAMES.POST_UNHIDDEN, payload)
  }

  ///////////////////////////////////////////////////

  async commentCreated(payload){
    return this.publish(PubSubAdapter.CHANNEL_NAMES.COMMENT_CREATED, payload)
  }

  async commentUpdated(payload){
    return this.publish(PubSubAdapter.CHANNEL_NAMES.COMMENT_UPDATED, payload)
  }

  async commentDestroyed(payload){
    return this.publish(PubSubAdapter.CHANNEL_NAMES.COMMENT_DESTROYED, payload)
  }

  ///////////////////////////////////////////////////

  async likeAdded(payload){
    return this.publish(PubSubAdapter.CHANNEL_NAMES.LIKE_ADDED, payload)
  }

  async likeRemoved(payload){
    return this.publish(PubSubAdapter.CHANNEL_NAMES.LIKE_REMOVED, payload)
  }

  ///////////////////////////////////////////////////

  async publish(channel, payload){
    return this.database.publishAsync(channel, payload)
  }
}

export class PubSubAdapter{
  constructor(database){
    this.database = database
  }

  ///////////////////////////////////////////////////

  async postCreated(payload){
    return this.publish('post:new', payload)
  }

  async postUpdated(payload){
    return this.publish('post:update', payload)
  }

  async postDestroyed(payload){
    return this.publish('post:destroy', payload)
  }

  async postHidden(payload){
    return this.publish('post:hide', payload)
  }

  async postUnhidden(payload){
    return this.publish('post:unhide', payload)
  }

  ///////////////////////////////////////////////////

  async commentCreated(payload){
    return this.publish('comment:new', payload)
  }

  async commentUpdated(payload){
    return this.publish('comment:update', payload)
  }

  async commentDestroyed(payload){
    return this.publish('comment:destroy', payload)
  }

  ///////////////////////////////////////////////////

  async likeAdded(payload){
    return this.publish('like:new', payload)
  }

  async likeRemoved(payload){
    return this.publish('like:remove', payload)
  }

  ///////////////////////////////////////////////////

  async publish(channel, payload){
    return this.database.publishAsync(channel, payload)
  }
}

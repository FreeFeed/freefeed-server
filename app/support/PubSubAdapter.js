export class PubSubAdapter{
  constructor(database){
    this.database = database
  }

  async publish(channel, payload){
    return this.database.publishAsync(channel, payload)
  }
}

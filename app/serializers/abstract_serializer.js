import async from 'async'
import { promisify } from 'bluebird'
import _ from 'lodash'
import s from 'underscore.string'


export const AbstractSerializer = function(object, strategy) {
  this.object   = object
  this.strategy = strategy
}

AbstractSerializer.prototype = {
  END_POINT: 1,
  NESTED_STRATEGY: 2,
  THROUGH_POINT: 3,

  getField: async function (field){
    if (!this.object) {
      return null
    }
    if (!this.object[field]) {
      let name = "get" + s(field).capitalize().value()
      let method = this.object[name]

      if (method) {
        return await method.apply(this.object)
      }
      return null
    }

    return this.object[field]
  },

  decideNode: function(field) {
    if (!this.strategy[field]) {
      return this.END_POINT
    }

    if (this.strategy[field].through) {
      return this.THROUGH_POINT
    }

    return this.NESTED_STRATEGY
  },

  processMultiObjects: async function(objects, strategy, serializer, root, level) {
    let promises = []

    for (let object of objects){
      let selectedSerializer
      if (serializer) {
        selectedSerializer = new serializer(object)
      } else {
        selectedSerializer = new AbstractSerializer(object, strategy)
      }
      let promise = selectedSerializer.promiseToJSON(root, level + 1)
      promises.push(promise)
    }

    return Promise.all(promises)
  },

  processMultiObjectsWithRoot: async function(field, objects, strategy, serializer, root, level) {
    let results
    let promises = []

    let node = serializer ? new serializer(objects[0]).name : field

    for (let object of objects){
      let inArray = _.any(root[node], function(item) {
        return item.id == object.id
      })

      let selectedSerializer
      if (!inArray) {
        if (serializer) {
          selectedSerializer = new serializer(object)
        } else {
          selectedSerializer = new AbstractSerializer(object, strategy)
        }
        let promise = selectedSerializer.promiseToJSON(root, level + 1)
        promises.push(promise)
      }
    }

    results = await Promise.all(promises)

    if (typeof root[node] === 'undefined') {
      root[node] = results
    } else {
      root[node] = root[node].concat(results)
    }
  },

  processNestedStrategy: async function(field, root, level) {
    let fieldValue = await this.getField(field)

    if (!Array.isArray(fieldValue)){
      return new AbstractSerializer(fieldValue, this.strategy[field]).promiseToJSON(root, level + 1)
    }

    return this.processMultiObjects(fieldValue, this.strategy[field], null, root, level)
  },

  processThroughPoint: async function(field, root, level) {
    let serializer = this

    let processWithRoot = async function(_objects, one) {
      let objects = _.filter(_objects, function(object) { return _.has(object, 'id') })
      let objectIds = objects.map(function(e) { return e.id })
      let strategy = serializer.strategy[field]

      await serializer.processMultiObjectsWithRoot(strategy.model || field,
                                             objects,
                                             strategy,
                                             strategy.through,
                                             root,
                                             level)

      if (one)
        objectIds = objectIds[0]

      return objectIds
    }

    let fieldValue = await this.getField(field)
    if (!Array.isArray(fieldValue)){
      if (this.strategy[field].embed) {
        if (fieldValue) {
          return processWithRoot([fieldValue], true)
        }
        return null
      }
      return new this.strategy[field].through(fieldValue).promiseToJSON()
    }

    if (typeof fieldValue != 'undefined' && fieldValue.length > 0) {
      if (this.strategy[field].embed) {
        return processWithRoot(fieldValue)
      }

      return this.processMultiObjects(fieldValue, null, this.strategy[field].through, root, level)
    }

    return null
  },

  processNode: async function(root, field, level) {
    let fieldType = this.decideNode(field)
    let res
    switch (fieldType){
      case this.END_POINT:
        res = await this.getField(field)
        break

      case this.NESTED_STRATEGY:
        res = await this.processNestedStrategy(field, root, level)
        break

      case this.THROUGH_POINT:
        res = await this.processThroughPoint(field, root, level)
        break
    }

    return res
  },

  promiseToJSON: async function(root, level) {
    if (!this.strategy.select){
      return {}
    }
    let json = {}
    root = root || {}
    level = level || 0

    let nodeProcessor = async (fieldName)=>{
      let res = await this.processNode(root, fieldName, level + 1)
      if (res != null) {
        json[fieldName] = res
      }
    }

    let name = this.name
    let promises = []
    for (let fieldName of this.strategy.select){
      promises.push(nodeProcessor(fieldName))
    }

    await Promise.all(promises)

    if (level === 0) {
      let inner_json = json
      json = {}
      json[name] = inner_json

      json = _.extend(json, root)
    }
    return json
  }
}

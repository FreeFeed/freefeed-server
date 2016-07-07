import _ from 'lodash'
import s from 'underscore.string'


export const AbstractSerializer = function(object, strategy) {
  this.object   = object
  this.strategy = strategy
}

AbstractSerializer.prototype = {
  END_POINT:       1,
  NESTED_STRATEGY: 2,
  THROUGH_POINT:   3,
  RELATION_POINT:  4,

  RELATIONS_STORAGE: '__relations',

  getField: async function (field) {
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

    if (this.strategy[field].relation) {
      return this.RELATION_POINT
    }

    return this.NESTED_STRATEGY
  },

  processMultiObjects: async function(objects, strategy, serializer, root, level) {
    let promises = []

    for (let object of objects) {
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

    for (let object of objects) {
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

    if (!Array.isArray(fieldValue)) {
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
    if (!Array.isArray(fieldValue)) {
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

  processRelationPoint: async function (field, root) {
    let serializer = new this.strategy[field].serializeUsing(null)
    const modelName = serializer.name
    const tempIdsStorageName = `__${modelName}_ids`
    let storeTempModelIds = (modelIds)=>{
      if (!root[this.RELATIONS_STORAGE]) {
        root[this.RELATIONS_STORAGE] = {}
      }
      this.strategy[field].objectIdsKey = tempIdsStorageName

      root[this.RELATIONS_STORAGE][modelName] = this.strategy[field]
      if (typeof root[tempIdsStorageName] === 'undefined') {
        root[tempIdsStorageName] = modelIds
      } else {
        root[tempIdsStorageName] = root[tempIdsStorageName].concat(modelIds)
      }
    }

    let fieldValue = await this.getField(field)
    if (!Array.isArray(fieldValue)) {
      if (fieldValue) {
        storeTempModelIds([fieldValue])
        return fieldValue
      }
      return null
    }

    if (typeof fieldValue != 'undefined' && fieldValue.length > 0) {
      storeTempModelIds(fieldValue)
      return fieldValue
    }

    return null
  },

  processNode: async function(root, field, level) {
    let fieldType = this.decideNode(field)
    let res
    switch (fieldType) {
      case this.END_POINT:
        res = await this.getField(field)
        break

      case this.NESTED_STRATEGY:
        res = await this.processNestedStrategy(field, root, level)
        break

      case this.THROUGH_POINT:
        res = await this.processThroughPoint(field, root, level)
        break

      case this.RELATION_POINT:
        res = this.processRelationPoint(field, root, level)
        break
    }

    return res
  },

  promiseToJSON: async function(root, level) {
    if (!this.strategy.select) {
      return {}
    }
    let json = {}
    root = root || {}
    level = level || 0

    let nodeProcessor = async (fieldName)=>{
      let res = await this.processNode(root, fieldName, level + 1)
      if (res != null) {
        let currentStrategy = this.strategy[fieldName]
        if (currentStrategy && currentStrategy['relation'] && currentStrategy['customFieldName']) {
          fieldName = currentStrategy['customFieldName']
        }

        json[fieldName] = res
      }
    }

    let name = this.name
    let promises = []
    for (let fieldName of this.strategy.select) {
      promises.push(nodeProcessor(fieldName))
    }

    await Promise.all(promises)

    if (level === 0) {
      let inner_json = json
      json = {}
      json[name] = inner_json
      await this.loadRelations(root, level)
      json = _.extend(json, root)
    }
    return json
  },

  loadRelations: function (root, level) {
    let relations = root[this.RELATIONS_STORAGE]
    if (!relations) {
      return null
    }

    let relationsDescr = _.map(relations, (descr, k)=>{
      descr.relKey = k
      let relatedObjectsIds = _.uniq(root[descr.objectIdsKey])
      let existingObjects = root[descr.relKey]
        , existingObjectsIds = []
      if (Array.isArray(existingObjects) && existingObjects.length > 0) {
        existingObjectsIds = existingObjects.map((obj)=>obj.id)
        relatedObjectsIds = _.difference(relatedObjectsIds, existingObjectsIds)
      }
      descr.objectIds = relatedObjectsIds
      return descr
    })

    delete root[this.RELATIONS_STORAGE]

    let promises = relationsDescr.map(async (rel)=>{
      let relatedObjects = await this.serializeRelation(root, rel.objectIds, rel.model, rel.serializeUsing, level)
      let existingObjects = root[rel.relKey] || []
      relatedObjects = relatedObjects || []
      root[rel.relKey] = relatedObjects.concat(existingObjects)
      delete root[rel.objectIdsKey]
    })
    return Promise.all(promises)
  },

  serializeRelation: async (root, objectIds, model, serializer, level)=>{
    let objects = await model.getObjectsByIds(objectIds)
    let promises = objects.map((object)=>{
      return new serializer(object).promiseToJSON(root, level + 1)
    })
    return Promise.all(promises)
  }
}

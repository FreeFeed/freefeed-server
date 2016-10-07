import _ from 'lodash'
import s from 'underscore.string'


export const AbstractSerializer = function (object, strategy) {
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
      const fieldName = s(field).capitalize().value();
      const name = `get${fieldName}`
      const method = this.object[name]

      if (method) {
        return await Reflect.apply(method, this.object, []);
      }
      return null
    }

    return this.object[field]
  },

  decideNode: function (field) {
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

  processMultiObjects: async function (objects, strategy, serializer, root, level) {
    const promises = []

    for (const object of objects) {
      let selectedSerializer
      if (serializer) {
        selectedSerializer = new serializer(object)
      } else {
        selectedSerializer = new AbstractSerializer(object, strategy)
      }
      const promise = selectedSerializer.promiseToJSON(root, level + 1)
      promises.push(promise)
    }

    return Promise.all(promises)
  },

  processMultiObjectsWithRoot: async function (field, objects, strategy, serializer, root, level) {
    const promises = []

    const node = serializer ? new serializer(objects[0]).name : field

    for (const object of objects) {
      const inArray = _.some(root[node], (item) => (item.id == object.id))

      let selectedSerializer
      if (!inArray) {
        if (serializer) {
          selectedSerializer = new serializer(object)
        } else {
          selectedSerializer = new AbstractSerializer(object, strategy)
        }
        const promise = selectedSerializer.promiseToJSON(root, level + 1)
        promises.push(promise)
      }
    }

    const results = await Promise.all(promises)

    if (typeof root[node] === 'undefined') {
      root[node] = results
    } else {
      root[node] = root[node].concat(results)
    }
  },

  processNestedStrategy: async function (field, root, level) {
    const fieldValue = await this.getField(field)

    if (!Array.isArray(fieldValue)) {
      return new AbstractSerializer(fieldValue, this.strategy[field]).promiseToJSON(root, level + 1)
    }

    return this.processMultiObjects(fieldValue, this.strategy[field], null, root, level)
  },

  processThroughPoint: async function (field, root, level) {
    const serializer = this

    const processWithRoot = async function (_objects, one) {
      const objects = _.filter(_objects, (object) => _.has(object, 'id'))
      const objectIds = objects.map((e) => e.id)
      const strategy = serializer.strategy[field]

      await serializer.processMultiObjectsWithRoot(strategy.model || field,
                                             objects,
                                             strategy,
                                             strategy.through,
                                             root,
                                             level)

      return one ? objectIds[0] : objectIds;
    }

    const fieldValue = await this.getField(field)
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
    const serializer = new this.strategy[field].serializeUsing(null)
    const modelName = serializer.name
    const tempIdsStorageName = `__${modelName}_ids`
    const storeTempModelIds = (modelIds) => {
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

    const fieldValue = await this.getField(field)
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

  processNode: async function (root, field, level) {
    const fieldType = this.decideNode(field)
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

  promiseToJSON: async function (root, level) {
    if (!this.strategy.select) {
      return {}
    }

    const json = {};
    root = root || {}
    level = level || 0

    const nodeProcessor = async (fieldName) => {
      const res = await this.processNode(root, fieldName, level + 1)
      if (res != null) {
        const currentStrategy = this.strategy[fieldName]
        if (currentStrategy && currentStrategy['relation'] && currentStrategy['customFieldName']) {
          fieldName = currentStrategy['customFieldName']
        }

        json[fieldName] = res
      }
    }

    const name = this.name
    const promises = []
    for (const fieldName of this.strategy.select) {
      promises.push(nodeProcessor(fieldName))
    }

    await Promise.all(promises)

    if (level !== 0) {
      return json;
    }

    await this.loadRelations(root, level);

    return { [name]: json, ...root };
  },

  loadRelations: function (root, level) {
    const relations = root[this.RELATIONS_STORAGE]
    if (!relations) {
      return null
    }

    const relationsDescr = _.map(relations, (descr, k) => {
      descr.relKey = k

      let relatedObjectsIds = _.uniq(root[descr.objectIdsKey])
      let existingObjectsIds = []

      const existingObjects = root[descr.relKey]
      if (Array.isArray(existingObjects) && existingObjects.length > 0) {
        existingObjectsIds = existingObjects.map((obj) => obj.id)
        relatedObjectsIds = _.difference(relatedObjectsIds, existingObjectsIds)
      }

      descr.objectIds = relatedObjectsIds

      return descr
    })

    Reflect.deleteProperty(root, this.RELATIONS_STORAGE);

    const promises = relationsDescr.map(async (rel) => {
      let relatedObjects = await this.serializeRelation(root, rel.objectIds, rel.model, rel.serializeUsing, level)
      const existingObjects = root[rel.relKey] || []
      relatedObjects = relatedObjects || []
      root[rel.relKey] = relatedObjects.concat(existingObjects)
      Reflect.deleteProperty(root, rel.objectIdsKey);
    })
    return Promise.all(promises)
  },

  serializeRelation: async (root, objectIds, model, serializer, level) => {
    const objects = await model.getObjectsByIds(objectIds)
    const promises = objects.map((object) => {
      return new serializer(object).promiseToJSON(root, level + 1)
    })
    return Promise.all(promises)
  }
}

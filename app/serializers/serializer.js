import { inherits } from 'util'

import { AbstractSerializer } from '../models'


export function Serializer(name, strategy) {
  const SpecializedSerializer = function (object) {
    this.object = object
    this.strategy = strategy
    this.name = name
  }

  inherits(SpecializedSerializer, AbstractSerializer)

  return SpecializedSerializer
}


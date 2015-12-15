"use strict";

import * as dbAdapter from '../support/DbAdapter'

import Promise from "bluebird"
import { inherits } from "util"

import { AbstractModel, User, Group } from "../../app/models"
import { mkKey } from "../support/models"
import { load as configLoader } from "../../config/config"
import { NotFoundException } from "../support/exceptions"

let config = configLoader()


exports.addModel = function(database) {
  var FeedFactory = function() {
  }

  inherits(FeedFactory, AbstractModel)

  FeedFactory.stopList = function(default_stop_list) {
    if (default_stop_list)
      return config.application.DEFAULT_STOP_LIST
    else
      return config.application.USERNAME_STOP_LIST
  }

  FeedFactory.findById = async function(identifier) {
    let attrs = await dbAdapter.getUserById(database, identifier)

    if (attrs.type === 'group') {
      return Group.initObject(attrs, identifier)
    } else {
      return User.initObject(attrs, identifier)
    }
  }

  FeedFactory.findByIds = async function(identifiers) {
    let responses = await dbAdapter.getUsersByIds(database, identifiers)
    let objects = responses.map((attrs, i) => {
      if (attrs.type === 'group') {
        return Group.initObject(attrs, identifiers[i])
      } else {
        return User.initObject(attrs, identifiers[i])
      }
    })

    return objects
  }

  FeedFactory.findByUsername = async function(username) {
    let identifier = await dbAdapter.getUserIdByUsername(database, username)

    if (null === identifier) {
      throw new NotFoundException(`user "${username}" is not found`)
    }

    return FeedFactory.findById(identifier)
  }

  return FeedFactory
}

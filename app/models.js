"use strict";

import {DbAdapter} from './support/DbAdapter'
import {PubSubAdapter} from './support/PubSubAdapter'

var redis = require('../config/database')
  , database = redis.connect()

exports.database = database

exports.AbstractSerializer = require('./serializers/abstract_serializer').addSerializer()
exports.Serializer         = require("./serializers/serializer").addSerializer()

var PubSub = require('./pubsub')
let dbAdapter = new DbAdapter(database)
let pubsubAdapter = new PubSubAdapter(database)

exports.PubSub = new PubSub(pubsubAdapter)

exports.AbstractModel = require('./models/abstract_model').addModel(dbAdapter)
exports.User          = require('./models/user').addModel(dbAdapter)
exports.Group         = require('./models/group').addModel(dbAdapter)
exports.FeedFactory   = require('./models/feed-factory').addModel(dbAdapter)
exports.Post          = require('./models/post').addModel(dbAdapter)
exports.Timeline      = require('./models/timeline').addModel(dbAdapter)
exports.Attachment    = require('./models/attachment').addModel(dbAdapter)
exports.Comment       = require('./models/comment').addModel(dbAdapter)
exports.Stats         = require('./models/stats').addModel(dbAdapter)

exports.AdminSerializer         = require('./serializers/v1/AdminSerializer').addSerializer()
exports.UserSerializer         = require('./serializers/v1/UserSerializer').addSerializer()
exports.SubscriberSerializer   = require('./serializers/v1/SubscriberSerializer').addSerializer()
exports.SubscriptionSerializer = require('./serializers/v1/SubscriptionSerializer').addSerializer()
exports.SubscriptionRequestSerializer = require('./serializers/v1/SubscriptionRequestSerializer').addSerializer()
exports.MyProfileSerializer    = require('./serializers/v1/MyProfileSerializer').addSerializer()
exports.LikeSerializer         = require('./serializers/v1/LikeSerializer').addSerializer()
exports.GroupSerializer        = require('./serializers/v1/GroupSerializer').addSerializer()
exports.AttachmentSerializer   = require('./serializers/v1/AttachmentSerializer').addSerializer()
exports.CommentSerializer      = require('./serializers/v1/CommentSerializer').addSerializer()
exports.PubsubCommentSerializer = require('./serializers/v1/PubsubCommentSerializer').addSerializer()
exports.PostSerializer         = require('./serializers/v1/PostSerializer').addSerializer()
exports.TimelineSerializer     = require('./serializers/v1/TimelineSerializer').addSerializer()

var models = require("../../models")
  , Serializer = models.Serializer
  , AdminSerializer = models.AdminSerializer

exports.addSerializer = function() {
  return new Serializer('users', {
    select: ['id', 'username', 'type', 'screenName', 'statistics',
             'profilePictureLargeUrl', 'profilePictureMediumUrl',
             'createdAt', 'updatedAt', 'isPrivate',
             'administrators'],
    administrators: { through: AdminSerializer, embed: true }
  })
}

import validator from 'validator';

///////////////////////////////////////////////////
// Invitations
///////////////////////////////////////////////////

const invitationsTrait = (superClass) => class extends superClass {
  getInvitation(secureId) {
    if (!validator.isUUID(secureId, 4)) {
      return null;
    }
    return this.database('invitations').first().where('secure_id', secureId);
  }

  createInvitation(authorIntId, message, lang, singleUse, userNames, groupNames) {
    const payload = {
      author:          authorIntId,
      message,
      lang,
      single_use:      singleUse,
      recommendations: {
        users:  userNames,
        groups: groupNames
      }
    };

    return this.database('invitations').insert(payload).returning('secure_id');
  }
};

export default invitationsTrait;

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
};

export default invitationsTrait;

import { InvitationsController } from '../../../controllers';

export default function addRoutes(app) {
  app.get('/invitations/info', InvitationsController.invitationsInfo);
  app.get('/invitations/:secureId', InvitationsController.getInvitation);
  app.post('/invitations', InvitationsController.createInvitation);
}

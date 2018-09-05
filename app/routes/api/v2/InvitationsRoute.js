import { InvitationsController } from '../../../controllers'


export default function addRoutes(app) {
  app.get('/v2/invitations/:secureId', InvitationsController.getInvitation);
  app.post('/v2/invitations', InvitationsController.createInvitation);
}

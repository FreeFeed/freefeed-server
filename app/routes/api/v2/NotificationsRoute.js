import { EventsController } from '../../../controllers';

export default function addRoutes(app) {
  app.get('/notifications', EventsController.myEvents);
  app.get('/notifications/:notifId', EventsController.eventById);
}

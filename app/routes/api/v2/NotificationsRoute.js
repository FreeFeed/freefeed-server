import { EventsController } from '../../../controllers';

export default function addRoutes(app) {
  app.get('/v2/notifications', EventsController.myEvents);
}

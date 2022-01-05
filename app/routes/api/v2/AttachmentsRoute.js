import { AttachmentsController } from '../../../controllers';

export default function addRoutes(app) {
  const controller = new AttachmentsController(app);

  app.get('/v2/attachments/my', controller.my);
}

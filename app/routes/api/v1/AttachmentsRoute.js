import { AttachmentsController } from '../../../controllers';

export default function addRoutes(app) {
  const controller = new AttachmentsController(app);

  app.post('/attachments', controller.create);
}

import { AttachmentsController } from '../../../controllers'


export default function addRoutes(app) {
  app.post('/v1/attachments', AttachmentsController.create)
}

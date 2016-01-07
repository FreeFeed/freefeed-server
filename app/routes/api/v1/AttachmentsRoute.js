import { AttachmentsController } from '../../../controllers'


export default function addRoutes(app) {
  const controller = new AttachmentsController(app)

  app.post('/v1/attachments', controller.create)
}

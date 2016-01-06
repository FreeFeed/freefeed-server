import { SessionController } from '../../../controllers'


export default function addRoutes(app) {
  app.post('/v1/session', SessionController.create)
}

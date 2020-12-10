import { SessionController } from '../../../controllers'


export default function addRoutes(app) {
  app.post('/v1/session', SessionController.create);
  app.delete('/v1/session', SessionController.close);
  app.post('/v1/session/reissue', SessionController.reissue);
}

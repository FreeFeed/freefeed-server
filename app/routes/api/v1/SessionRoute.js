import { SessionController } from '../../../controllers';

export default function addRoutes(app) {
  app.post('/session', SessionController.create);
  app.delete('/session', SessionController.close);
  app.post('/session/reissue', SessionController.reissue);
  app.get('/session/list', SessionController.list);
  app.patch('/session/list', SessionController.updateList);
}

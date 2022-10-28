import { PasswordsController } from '../../../controllers';

export default function addRoutes(app) {
  app.post('/passwords', PasswordsController.create);
  app.put('/passwords/:resetPasswordToken', PasswordsController.update);
}

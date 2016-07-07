import { PasswordsController } from '../../../controllers'


export default function addRoutes(app) {
  app.post('/v1/passwords',                     PasswordsController.create)
  app.put('/v1/passwords/:resetPasswordToken', PasswordsController.update)
}

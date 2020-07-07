import { FeedFactoriesController, UsersController } from '../../../controllers'
import deprecated from '../../../controllers/api/v1/Deprecated';


export default function addRoutes(app) {
  app.post('/v1/users',                         UsersController.create);
  app.post('/v1/users/sudo',                    UsersController.sudoCreate);
  app.post('/v1/users/acceptRequest/:username', UsersController.acceptRequest);
  app.post('/v1/users/rejectRequest/:username', UsersController.rejectRequest);
  // NOTE: this is going to change and be more consistent when we
  // introduce groups management
  app.post('/v1/users/:username/unsubscribeFromMe', UsersController.unsubscribeUser);
  app.post('/v1/users/:username/sendRequest',       UsersController.sendRequest);
  app.get('/v1/users/whoami',                       deprecated('Please use /v2/users/whoami'));
  app.get('/v1/users/me',                           UsersController.showMe);
  app.post('/v1/users/suspend-me',                  UsersController.suspendMe);
  app.get('/v1/users/:username',                    UsersController.show);
  app.put('/v1/users/updatePassword',               UsersController.updatePassword);
  app.post('/v1/users/updateProfilePicture',        UsersController.updateProfilePicture);
  app.put('/v1/users/:userId',                      FeedFactoriesController.update);
  app.post('/v1/users/:username/ban',               UsersController.ban);
  app.post('/v1/users/:username/unban',             UsersController.unban);
  app.post('/v1/users/:username/subscribe',         UsersController.subscribe);
  app.put('/v1/users/:username/subscribe',          UsersController.updateSubscription);
  app.post('/v1/users/:username/unsubscribe',       UsersController.unsubscribe);
  app.get('/v1/users/:username/subscribers',        UsersController.subscribers);
  app.get('/v1/users/:username/subscriptions',      UsersController.subscriptions);
}

import { FeedFactoriesController, UsersController } from '../../../controllers';

export default function addRoutes(app) {
  app.post('/users', UsersController.create);
  app.post('/users/sudo', UsersController.sudoCreate);
  app.post('/users/acceptRequest/:username', UsersController.acceptRequest);
  app.post('/users/rejectRequest/:username', UsersController.rejectRequest);
  // NOTE: this is going to change and be more consistent when we
  // introduce groups management
  app.post('/users/:username/unsubscribeFromMe', UsersController.unsubscribeUser);
  app.post('/users/:username/sendRequest', UsersController.sendRequest);
  app.get('/users/me', UsersController.showMe);
  app.post('/users/suspend-me', UsersController.suspendMe);
  app.post('/users/resume-me', UsersController.resumeMe);
  app.get('/users/:username', UsersController.show);
  app.put('/users/updatePassword', UsersController.updatePassword);
  app.post('/users/updateProfilePicture', UsersController.updateProfilePicture);
  app.put('/users/:userId', FeedFactoriesController.update);
  app.post('/users/:username/ban', UsersController.ban);
  app.post('/users/:username/unban', UsersController.unban);
  app.post('/users/:username/subscribe', UsersController.subscribe);
  app.put('/users/:username/subscribe', UsersController.updateSubscription);
  app.post('/users/:username/unsubscribe', UsersController.unsubscribe);
  app.get('/users/:username/subscribers', UsersController.subscribers);
  app.get('/users/:username/subscriptions', UsersController.subscriptions);
}

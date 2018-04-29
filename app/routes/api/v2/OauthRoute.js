import OauthController from '../../../controllers/api/v2/OauthController';

export default function addRoutes(app) {
  app.get('/v2/oauth/:provider', OauthController.authenticate);
  app.get('/v2/oauth/:provider/callback', OauthController.callback);
  app.get('/v2/oauth/:provider/link', OauthController.link);
  app.post('/v2/oauth/:provider/unlink', OauthController.unlink);

  // For requesting oauth access tokens
  app.get('/v2/oauth/:provider/authz', OauthController.authorize);
  app.get('/v2/oauth/:provider/authz/callback', OauthController.authorizeCallback);

  // Provider-specific API (require access token)
  app.get('/v2/oauth/facebook/friends', OauthController.facebookFriends);
}


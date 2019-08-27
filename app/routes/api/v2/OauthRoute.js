import OauthController from '../../../controllers/api/v2/OauthController';


export default function addRoutes(app) {
  app.get('/v2/oauth/:provider/auth', OauthController.authenticate);
  app.get('/v2/oauth/:provider/callback', OauthController.authenticateCallback);
  app.get('/v2/oauth/:provider/link', OauthController.link);
  app.post('/v2/oauth/:provider/:providerId/unlink', OauthController.unlink);

  // For requesting oauth access tokens
  app.get('/v2/oauth/:provider/authz', OauthController.authorize);
  app.get('/v2/oauth/:provider/authz/callback', OauthController.authorizeCallback);

  app.get('/v2/oauth/methods', OauthController.userAuthMethods);

  // Provider-specific API (require access token)
  app.get('/v2/oauth/facebook/:providerId/friends', OauthController.facebookFriends);
  app.get('/v2/oauth/facebook/allFriends', OauthController.allFacebookFriends);
}


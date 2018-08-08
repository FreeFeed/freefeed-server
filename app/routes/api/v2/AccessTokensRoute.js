import { getTokens, createToken, revokeToken } from '../../../controllers/api/v2/AccessTokensController';


export default function addRoutes(app) {
  app.get('/v2/tokens', getTokens);
  app.post('/v2/tokens/create', createToken);
  app.post('/v2/tokens/revoke', revokeToken);
}

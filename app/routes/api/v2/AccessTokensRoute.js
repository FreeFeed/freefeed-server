import { getTokens, createToken, revokeToken } from '../../../controllers/api/v2/AccessTokensController';


export default function addRoutes(app) {
  app.get('/v2/tokens', getTokens);
  app.post('/v2/tokens', createToken);
  app.delete('/v2/tokens/:tokenId', revokeToken);
}

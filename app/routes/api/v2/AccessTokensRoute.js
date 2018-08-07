import { getTokens } from '../../../controllers/api/v2/AccessTokensController';


export default function addRoutes(app) {
  app.get('/v2/tokens', getTokens);
}

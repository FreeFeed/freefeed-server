import {
  create,
  inactivate,
  reissue,
  update,
  scopes,
  list,
} from '../../../controllers/api/v2/AppTokensController';


export default function addRoutes(app) {
  app.get('/v2/app-tokens/scopes', scopes);
  app.get('/v2/app-tokens', list);
  app.post('/v2/app-tokens', create);
  app.post('/v2/app-tokens/:tokenId/reissue', reissue);
  app.put('/v2/app-tokens/:tokenId', update);
  app.delete('/v2/app-tokens/:tokenId', inactivate);
}

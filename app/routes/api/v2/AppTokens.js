import {
  create,
  inactivate,
  reissue,
  update,
  scopes,
  list,
  current,
  reissueCurrent,
  activate,
} from '../../../controllers/api/v2/AppTokensController';

export default function addRoutes(app) {
  app.get('/v2/app-tokens/scopes', scopes);
  app.get('/v2/app-tokens', list);
  app.post('/v2/app-tokens', create);
  app.post('/v2/app-tokens/activate', activate);
  app.get('/v2/app-tokens/current', current);
  app.post('/v2/app-tokens/current/reissue', reissueCurrent);
  app.post('/v2/app-tokens/:tokenId/reissue', reissue);
  app.put('/v2/app-tokens/:tokenId', update);
  app.delete('/v2/app-tokens/:tokenId', inactivate);
}

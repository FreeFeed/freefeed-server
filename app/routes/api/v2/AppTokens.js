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
  app.get('/app-tokens/scopes', scopes);
  app.get('/app-tokens', list);
  app.post('/app-tokens', create);
  app.post('/app-tokens/activate', activate);
  app.get('/app-tokens/current', current);
  app.post('/app-tokens/current/reissue', reissueCurrent);
  app.post('/app-tokens/:tokenId/reissue', reissue);
  app.put('/app-tokens/:tokenId', update);
  app.delete('/app-tokens/:tokenId', inactivate);
}

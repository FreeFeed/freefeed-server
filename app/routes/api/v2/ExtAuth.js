import {
  listProfiles,
  removeProfile,
  authStart,
  authFinish,
} from '../../../controllers/api/v2/ExtAuthController';

export default function addRoutes(app) {
  app.get('/ext-auth/profiles', listProfiles);
  app.delete('/ext-auth/profiles/:profileId', removeProfile);
  app.post('/ext-auth/auth-start', authStart);
  app.post('/ext-auth/auth-finish', authFinish);
}

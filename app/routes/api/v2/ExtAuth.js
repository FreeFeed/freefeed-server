import {
  listProfiles,
  removeProfile,
  authStart,
  authFinish,
} from '../../../controllers/api/v2/ExtAuthController';


export default function addRoutes(app) {
  app.get('/v2/ext-auth/profiles', listProfiles);
  app.delete('/v2/ext-auth/profiles/:profileId', removeProfile);
  app.post('/v2/ext-auth/auth-start', authStart);
  app.post('/v2/ext-auth/auth-finish', authFinish);
}

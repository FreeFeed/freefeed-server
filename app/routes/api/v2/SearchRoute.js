import { SearchController } from '../../../controllers'


export default function addRoutes(app) {
  const controller = new SearchController(app);
  app.get('/v2/search', controller.search);
}

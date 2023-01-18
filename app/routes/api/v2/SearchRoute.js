import { SearchController } from '../../../controllers';

export default function addRoutes(app) {
  const controller = new SearchController(app);
  app.get('/search', controller.search);
}

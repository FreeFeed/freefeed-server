import { SearchController } from '../../../controllers'


export default function addRoutes(app) {
  app.get('/v2/search', SearchController.search)
}

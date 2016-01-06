import { BookmarkletController } from '../../../controllers'


export default function addRoutes(app) {
  app.post('/v1/bookmarklet', BookmarkletController.create)
}

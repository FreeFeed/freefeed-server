import { TimelinesController } from '../../../controllers'
import deprecated from '../../../controllers/api/v1/Deprecated';


export default function addRoutes(app) {
  app.get('/v1/timelines/home',               deprecated('Please use /v2/timelines/home'))
  app.get('/v1/timelines/filter/discussions', TimelinesController.myDiscussions)
  app.get('/v1/timelines/filter/directs',     TimelinesController.directs)
  app.get('/v1/timelines/:username',          TimelinesController.posts)
  app.get('/v1/timelines/:username/likes',    TimelinesController.likes)
  app.get('/v1/timelines/:username/comments', TimelinesController.comments)
}

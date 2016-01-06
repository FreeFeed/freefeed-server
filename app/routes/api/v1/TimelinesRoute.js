import { TimelinesController } from '../../../controllers'


export default function addRoutes(app) {
  app.get('/v1/timelines/home',               TimelinesController.home)
  app.get('/v1/timelines/filter/discussions', TimelinesController.myDiscussions)
  app.get('/v1/timelines/filter/directs',     TimelinesController.directs)
  app.get('/v1/timelines/:username',          TimelinesController.posts)
  app.get('/v1/timelines/:username/likes',    TimelinesController.likes)
  app.get('/v1/timelines/:username/comments', TimelinesController.comments)
}

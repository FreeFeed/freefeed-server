import TimelinesController from '../../../controllers/api/v2/TimelinesController'


export default function addRoutes(app) {
  const controller = new TimelinesController(app);

  app.get('/v2/bestof', controller.bestOf);
  app.get('/v2/timelines/home', controller.home);
  app.get('/v2/timelines/filter/discussions', controller.myDiscussions);
  app.get('/v2/timelines/filter/directs', controller.directs);
  app.get('/v2/timelines/:username', controller.userTimeline('Posts'))
  app.get('/v2/timelines/:username/likes', controller.userTimeline('Likes'))
  app.get('/v2/timelines/:username/comments', controller.userTimeline('Comments'))
}

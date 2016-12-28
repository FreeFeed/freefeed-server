import TimelinesController from '../../../controllers/api/v2/TimelinesController'


export default function addRoutes(app) {
  const controller = new TimelinesController(app);

  app.get('/v2/bestof', controller.bestOf);
  app.get('/v2/timelines/home', controller.home);
}

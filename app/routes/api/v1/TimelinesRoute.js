import deprecated from '../../../controllers/api/v1/Deprecated';

export default function addRoutes(app) {
  app.get('/v1/timelines/home',               deprecated('Please use /v2/timelines/home'))
  app.get('/v1/timelines/filter/discussions', deprecated('Please use /v2/timelines/filter/discussions'))
  app.get('/v1/timelines/filter/directs',     deprecated('Please use /v2/timelines/filter/directs'))
  app.get('/v1/timelines/:username',          deprecated('Please use /v2/timelines/:username'))
  app.get('/v1/timelines/:username/likes',    deprecated('Please use /v2/timelines/:username/likes'))
  app.get('/v1/timelines/:username/comments', deprecated('Please use /v2/timelines/:username/comments'))
}

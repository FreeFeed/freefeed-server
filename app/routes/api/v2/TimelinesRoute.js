import { bestOf, ownTimeline, userTimeline, metatags } from '../../../controllers/api/v2/TimelinesController';
import { timelineRSS } from '../../../controllers/api/v2/TimelinesRSS';


export default function addRoutes(app) {
  app.get('/v2/bestof',                       bestOf);
  app.get('/v2/timelines/home',               ownTimeline('RiverOfNews', { withLocalBumps: true }));
  app.get('/v2/timelines/filter/discussions', ownTimeline('MyDiscussions'));
  app.get('/v2/timelines/filter/directs',     ownTimeline('Directs'));
  app.get('/v2/timelines/:username',          userTimeline('Posts'));
  app.get('/v2/timelines/:username/likes',    userTimeline('Likes'));
  app.get('/v2/timelines/:username/comments', userTimeline('Comments'));
  app.get('/v2/timelines-rss/:username',      timelineRSS);
  app.get('/v2/timelines-metatags/:username', metatags);
}

import {
  bestOf,
  everything,
  ownTimeline,
  userTimeline,
  metatags,
} from '../../../controllers/api/v2/TimelinesController';
import { timelineRSS } from '../../../controllers/api/v2/TimelinesRSS';
import {
  listHomeFeeds,
  createHomeFeed,
  deleteHomeFeed,
  updateHomeFeed,
  reorderHomeFeeds,
  listSubscriptions,
} from '../../../controllers/api/v2/HomeFeedsController';


export default function addRoutes(app) {
  app.get('/v2/bestof',                       bestOf);
  app.get('/v2/everything',                   everything);
  app.get('/v2/timelines/home',               ownTimeline('RiverOfNews', { withLocalBumps: true }));
  app.get('/v2/timelines/home/list',          listHomeFeeds);
  app.get('/v2/timelines/home/subscriptions', listSubscriptions);
  app.post('/v2/timelines/home',              createHomeFeed);
  app.put('/v2/timelines/home/:feedId',       updateHomeFeed);
  app.delete('/v2/timelines/home/:feedId',    deleteHomeFeed);
  app.patch('/v2/timelines/home',             reorderHomeFeeds);
  app.get('/v2/timelines/filter/discussions', ownTimeline('MyDiscussions'));
  app.get('/v2/timelines/filter/directs',     ownTimeline('Directs'));
  app.get('/v2/timelines/filter/saves',       ownTimeline('Saves'));
  app.get('/v2/timelines/:username',          userTimeline('Posts'));
  app.get('/v2/timelines/:username/likes',    userTimeline('Likes'));
  app.get('/v2/timelines/:username/comments', userTimeline('Comments'));
  app.get('/v2/timelines-rss/:username',      timelineRSS);
  app.get('/v2/timelines-metatags/:username', metatags);
}

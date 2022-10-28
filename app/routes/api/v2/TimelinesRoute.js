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
  getHomeFeedInfo,
} from '../../../controllers/api/v2/HomeFeedsController';

export default function addRoutes(app) {
  app.get('/bestof', bestOf);
  app.get('/everything', everything);
  app.get('/timelines/home/list', listHomeFeeds);
  app.get('/timelines/home/subscriptions', listSubscriptions);
  app.get('/timelines/home', ownTimeline('RiverOfNews', { withLocalBumps: true }));
  app.get('/timelines/home/:feedId/posts', ownTimeline('RiverOfNews', { withLocalBumps: true }));
  app.post('/timelines/home', createHomeFeed);
  app.get('/timelines/home/:feedId', getHomeFeedInfo);
  app.patch('/timelines/home/:feedId', updateHomeFeed);
  app.delete('/timelines/home/:feedId', deleteHomeFeed);
  app.patch('/timelines/home', reorderHomeFeeds);
  app.get('/timelines/filter/discussions', ownTimeline('MyDiscussions'));
  app.get('/timelines/filter/directs', ownTimeline('Directs'));
  app.get('/timelines/filter/saves', ownTimeline('Saves'));
  app.get('/timelines/:username', userTimeline('Posts'));
  app.get('/timelines/:username/likes', userTimeline('Likes'));
  app.get('/timelines/:username/comments', userTimeline('Comments'));
  app.get('/timelines-rss/:username', timelineRSS);
  app.get('/timelines-metatags/:username', metatags);
}

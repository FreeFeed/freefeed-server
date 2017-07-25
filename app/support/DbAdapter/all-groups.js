///////////////////////////////////////////////////
// All groups list
///////////////////////////////////////////////////

const allGroupsTrait = (superClass) => class extends superClass {
  /**
   * Returns list of public or public+protected groups:
   * [ { id: uuid, subscribers: int, postsByMonth: float, authorsVariety: float } ]
   */
  async getAllGroups(params = {}) {
    params = {
      withProtected: false,
      ...params,
    };

    const groups = await this.database
      .select('u.uid as uid', 'f.id as feedId', 'f.uid as feedUID')
      .from('users as u')
      .innerJoin('feeds as f', 'f.user_id', 'u.uid')
      .where({
        'u.type':       'group',
        'u.is_private': false,
        'f.name':       'Posts',
        ...(!params.withProtected ? { 'u.is_protected': false } : {}),
      });

    const feedUIDs   = groups.map((it) => it.feedUID);
    const feedIntIds = groups.map((it) => it.feedId);

    const subscribersRequest = this.database.raw(`
        select feed_id, count(*) from subscriptions
        where feed_id = any(:feedUIDs)
        group by feed_id
      `, { feedUIDs });
    const postsRequest = this.database.raw(`
        select
          user_id as author,
          destination_feed_ids & :feedIntIds as destinations,
          exp(-date_part('epoch', now() - created_at) / :avgInterval) as fade
        from
          posts
        where
          created_at > now() - :cutInterval::interval
          and destination_feed_ids && :feedIntIds
      `, {
        feedIntIds,
        cutInterval: '100 days',
        avgInterval: 30 * 86400,
      });

    const [
      { rows: subscribersRows },
      { rows: postsRows },
    ] = await Promise.all([
      subscribersRequest,
      postsRequest,
    ]);

    // Subscribers counts
    const subscribersMap = new Map();
    subscribersRows.forEach(({ feed_id, count }) => subscribersMap.set(feed_id, parseInt(count)));

    const incMapValue = (map, key, inc) => map.set(key, (map.get(key) || 0) + inc);
    const maxMapPercent = (map) => {
      let max = 0, sum = 0;
      map.forEach((v) => {
        sum += v;
        max = v > max ? v : max;
      });
      return max / sum;
    };

    // Posts analysis
    const postsByMonthMap = new Map();
    const postsAuthorsMap = new Map();
    postsRows.forEach(({ author, destinations, fade }) => {
      destinations.forEach((dest) => {
        incMapValue(postsByMonthMap, dest, fade);
        if (!postsAuthorsMap.has(dest)) {
          postsAuthorsMap.set(dest, new Map());
        }
        incMapValue(postsAuthorsMap.get(dest), author, fade);
      });
    });

    return groups.map((g) => ({
      id:             g.uid,
      subscribers:    subscribersMap.get(g.feedUID) || 0,
      postsByMonth:   postsByMonthMap.get(g.feedId) || 0,
      authorsVariety: postsAuthorsMap.has(g.feedId) ? 1 - maxMapPercent(postsAuthorsMap.get(g.feedId)) : 0,
    }));
  }
};

export default allGroupsTrait;

import _ from 'lodash';
import validator from 'validator'
import pgFormat from 'pg-format';

import { Post } from '../../models';
import { toTSVector } from '../search/to-tsvector';

import { initObject, prepareModelPayload, sqlNotIn } from './utils';

///////////////////////////////////////////////////
// Posts
///////////////////////////////////////////////////

const postsTrait = (superClass) => class extends superClass {
  async createPost(payload, destinationsIntIds) {
    const preparedPayload = prepareModelPayload(payload, POST_COLUMNS, POST_COLUMNS_MAPPING)
    preparedPayload.destination_feed_ids = destinationsIntIds
    preparedPayload.feed_ids = destinationsIntIds
    preparedPayload.body_tsvector = this.database.raw(
      // raw() interprets '?' chars as positional placeholders so we must escape them
      // https://github.com/knex/knex/issues/2622
      toTSVector(preparedPayload.body).replace(/\?/g, '\\?')
    );
    const res = await this.database('posts').returning('uid').insert(preparedPayload)
    return res[0]
  }

  async updatePost(postId, payload) {
    const preparedPayload = prepareModelPayload(payload, POST_COLUMNS, POST_COLUMNS_MAPPING)

    if ('body' in preparedPayload) {
      preparedPayload.body_tsvector = this.database.raw(
        // raw() interprets '?' chars as positional placeholders so we must escape them
        // https://github.com/knex/knex/issues/2622
        toTSVector(preparedPayload.body).replace(/\?/g, '\\?')
      );
    }

    return await this.database('posts').where('uid', postId).update(preparedPayload)
  }

  async getPostById(id, params) {
    if (!validator.isUUID(id)) {
      return null
    }

    const attrs = await this.database('posts').first().where('uid', id)
    return initPostObject(attrs, params)
  }

  async getPostsByIds(ids, params) {
    const responses = await this.database('posts').orderBy('bumped_at', 'desc').whereIn('uid', ids)
    return responses.map((attrs) => initPostObject(attrs, params))
  }

  getPostsIdsByIntIds(intIds) {
    return this.database('posts').select('id', 'uid').whereIn('id', intIds);
  }

  async getUserPostsCount(userId) {
    const res = await this.database('posts').where({ user_id: userId }).count()
    return parseInt(res[0].count)
  }

  setPostBumpedAt(postId, time = null) {
    let bumped_at = 'now';

    if (time) {
      const d = new Date();
      d.setTime(time);
      bumped_at = d.toISOString();
    }

    return this.database('posts').where('uid', postId).update({ bumped_at });
  }

  async deletePost(postId) {
    await this.database('posts').where({ uid: postId }).delete()

    // TODO: delete post local bumps
    return await Promise.all([
      this._deletePostLikes(postId),
      this._deletePostComments(postId)
    ])
  }

  async getPostUsagesInTimelines(postId) {
    const res = await this.database('posts').where('uid', postId)
    const [attrs] = res;

    if (!attrs) {
      return []
    }

    return this.getTimelinesUUIDsByIntIds(attrs.feed_ids)
  }

  insertPostIntoFeeds(feedIntIds, postId) {
    if (!feedIntIds || feedIntIds.length == 0) {
      return null
    }

    return this.database.raw('UPDATE posts SET feed_ids = (feed_ids | ?) WHERE uid = ?', [feedIntIds, postId]);
  }

  withdrawPostFromFeeds(feedIntIds, postUUID) {
    return this.database.raw('UPDATE posts SET feed_ids = (feed_ids - ?) WHERE uid = ?', [feedIntIds, postUUID]);
  }

  /**
   * Withdraw post from the commentator Comments feed
   * if there is not other comments from this commentator.
   *
   * @param {string} postId
   * @param {string} commentatorId
   */
  async withdrawPostFromCommentsFeedIfNoMoreComments(postId, commentatorId) {
    await this.database.transaction(async (trx) => {
      // Lock posts table
      await trx.raw('select 1 from posts where uid = :postId for update', { postId });

      // Check for another comments from this commentator
      const { rows } = await trx.raw(
        `select 1 from comments where post_id = :postId and user_id = :commentatorId limit 1`,
        { postId, commentatorId }
      );

      if (rows.length === 0) {
        const feedRes = await trx.raw(
          `select id from feeds where name = :name and user_id = :commentatorId`,
          { name: 'Comments', commentatorId },
        );
        const intId = feedRes.rows[0].id;
        await trx.raw(
          `update posts set feed_ids = feed_ids - :intId::int where uid = :postId`,
          { intId, postId }
        );
      }
    });
  }

  async isPostPresentInTimeline(timelineId, postId) {
    const res = await this.database('posts').where('uid', postId);
    const [postData] = res;
    return postData.feed_ids.includes(timelineId);
  }

  async getTimelinePostsRange(timelineId, offset, limit) {
    const res = await this.database('posts').select('uid', 'updated_at').orderBy('bumped_at', 'desc').offset(offset).limit(limit).whereRaw('feed_ids && ?', [[timelineId]])
    const postIds = res.map((record) => {
      return record.uid
    })
    return postIds
  }

  async getFeedsPostsRange(timelineIds, offset, limit, params) {
    const responses = await this.database('posts')
      .select('uid', 'created_at', 'updated_at', 'bumped_at', 'user_id', 'body', 'comments_disabled', 'feed_ids', 'destination_feed_ids')
      .orderBy('bumped_at', 'desc')
      .offset(offset).limit(limit)
      .whereRaw('feed_ids && ?', [timelineIds]);

    const postUids = responses.map((p) => p.uid)
    const commentsCount = {}
    const likesCount = {}

    const groupedComments = await this.database('comments')
      .select('post_id', this.database.raw('count(id) as comments_count'))
      .where('post_id', 'in', postUids)
      .groupBy('post_id')

    for (const group of groupedComments) {
      if (!commentsCount[group.post_id]) {
        commentsCount[group.post_id] = 0
      }

      commentsCount[group.post_id] += parseInt(group.comments_count)
    }

    const groupedLikes = await this.database('likes')
      .select('post_id', this.database.raw('count(id) as likes_count'))
      .where('post_id', 'in', postUids)
      .groupBy('post_id')

    for (const group of groupedLikes) {
      if (!likesCount[group.post_id]) {
        likesCount[group.post_id] = 0
      }

      likesCount[group.post_id] += parseInt(group.likes_count)
    }

    const objects = responses.map((attrs) => {
      if (attrs) {
        attrs.comments_count  = commentsCount[attrs.uid] || 0
        attrs.likes_count     = likesCount[attrs.uid] || 0
        attrs = prepareModelPayload(attrs, POST_FIELDS, POST_FIELDS_MAPPING)
      }

      return initObject(Post, attrs, attrs.id, params)
    })
    return objects
  }

  /**
   * Returns integer ids of private feeds that user can view
   * @param {String} userId   - UID of user
   * @return {Array.<Number>} - ids of feeds
   */
  async getVisiblePrivateFeedIntIds(userId) {
    const sql = `
      select f.id from 
        feeds f 
        join subscriptions s on f.uid = s.feed_id 
        join users u on u.uid = f.user_id and u.is_private 
      where s.user_id = :userId and f.name = 'Posts' 
      union  -- viewer's own Posts and Directs are always visible  
        select id from feeds where user_id = :userId and name in ('Posts', 'Directs') 
    `;

    const { rows } = await this.database.raw(sql, { userId });
    return _.map(rows, 'id');
  }

  async getTimelinesIntersectionPostIds(timelineId1, timelineId2) {
    const res1 = await this.database('posts').select('uid', 'updated_at').orderBy('bumped_at', 'desc').whereRaw('feed_ids && ?', [[timelineId1]])
    const postIds1 = res1.map((record) => {
      return record.uid
    })

    const res2 = await this.database('posts').select('uid', 'updated_at').orderBy('bumped_at', 'desc').whereRaw('feed_ids && ?', [[timelineId2]])
    const postIds2 = res2.map((record) => {
      return record.uid
    })

    return _.intersection(postIds1, postIds2)
  }

  /**
   * Show all PUBLIC posts with
   * 10+ likes
   * 15+ comments by 5+ users
   * Created less than 60 days ago
   */
  bestPostsIds = async (currentUser, offset = 0, limit = 30) => {
    const MIN_LIKES = 10;
    const MIN_COMMENTS = 15;
    const MIN_COMMENT_AUTHORS = 5;
    const MAX_DAYS = 60;

    let bannedUsersFilter = '';
    let usersWhoBannedMeFilter = '';

    const publicOrVisibleForAnonymous = currentUser ? 'not "users"."is_private"' : 'not "users"."is_protected"'

    if (currentUser) {
      const [iBanned, bannedMe] = await Promise.all([
        this.getUserBansIds(currentUser.id),
        this.getUserIdsWhoBannedUser(currentUser.id)
      ]);

      bannedUsersFilter = ` and ${sqlNotIn('posts.user_id', iBanned)}`;

      if (bannedMe.length > 0) {
        usersWhoBannedMeFilter = pgFormat('AND "feeds"."user_id" NOT IN (%L) ', bannedMe);
      }
    }

    const sql = `
      SELECT
        DISTINCT "posts".uid, "posts"."bumped_at" FROM "posts"
      LEFT JOIN (SELECT post_id, COUNT("id") AS "comments_count", COUNT(DISTINCT "user_id") as "comment_authors_count" FROM "comments" GROUP BY "comments"."post_id") AS "c" ON "c"."post_id" = "posts"."uid"
      LEFT JOIN (
        SELECT post_id, COUNT(likes.id) AS "likes_count" 
        FROM "likes"
          join users on users.uid = likes.user_id
        where users.gone_status is null
        GROUP BY "likes"."post_id"
      ) AS "l" ON "l"."post_id" = "posts"."uid"
      INNER JOIN "feeds" ON "posts"."destination_feed_ids" # feeds.id > 0 AND "feeds"."name" = 'Posts'
      INNER JOIN "users" ON "feeds"."user_id" = "users"."uid" AND ${publicOrVisibleForAnonymous}
      inner join users authors on posts.user_id = authors.uid
      WHERE
        "l"."likes_count" >= ${MIN_LIKES} AND "c"."comments_count" >= ${MIN_COMMENTS} AND "c"."comment_authors_count" >= ${MIN_COMMENT_AUTHORS} AND "posts"."created_at" > (current_date - ${MAX_DAYS} * interval '1 day')
        ${bannedUsersFilter}
        ${usersWhoBannedMeFilter}
        and authors.gone_status is null
      ORDER BY "posts"."bumped_at" DESC
      OFFSET ${offset} LIMIT ${limit}`;

    const { rows } = await this.database.raw(sql);
    return rows.map((r) => r.uid);
  };

  // Insert record to 'archive_post_names' table for the test purposes.
  async setOldPostName(postId, oldName, oldUrl) {
    return await this.database('archive_post_names').insert({ post_id: postId, old_post_name: oldName, old_url: oldUrl });
  }

  // Return new post's UID by its old name
  async getPostIdByOldName(oldName) {
    const rec = await this.database('archive_post_names')
      .first('post_id')
      .where({ old_post_name: oldName });

    if (rec) {
      return rec.post_id;
    }

    return null;
  }

  initRawPosts(rawPosts, params) {
    return rawPosts.map((attrs) => initPostObject(attrs, params));
  }

  async isPostInUserFeed(postUID, userUID, feedName) {
    const { rows } = await this.database.raw(
      `select 1 from 
        feeds f 
        join posts p on p.feed_ids && array[f.id] 
      where p.uid = :postUID and f.user_id = :userUID and f.name = :feedName 
      `,
      { postUID, userUID, feedName }
    );
    return rows.length > 0;
  }

  async getAdminsOfPostGroups(postUID) {
    const { rows } = await this.database.raw(
      `select distinct(ga.user_id) from
        posts p
        join feeds f on array[f.id] && p.destination_feed_ids
        join users owners on owners.uid = f.user_id
        join group_admins ga on owners.uid = ga.group_id
      where
        p.uid = :postUID
      `, { postUID }
    );
    const adminIds = _.map(rows, 'user_id');
    return this.getUsersByIds(adminIds);
  }

  /**
   * Return all groups post posted to or empty array
   *
   * @returns {Array.<User>}
   */
  async getPostGroups(postUID) {
    const { rows } = await this.database.raw(
      `select distinct(owners.uid) from
        posts p
        join feeds f on array[f.id] && p.destination_feed_ids
        join users owners on owners.uid = f.user_id and owners.type = 'group'
      where
        p.uid = :postUID
      `, { postUID }
    );
    const adminIds = _.map(rows, 'uid');
    return this.getUsersByIds(adminIds);
  }
};

export default postsTrait;

///////////////////////////////////////////////////

export function initPostObject(attrs, params) {
  if (!attrs) {
    return null;
  }

  attrs = prepareModelPayload(attrs, POST_FIELDS, POST_FIELDS_MAPPING);
  return initObject(Post, attrs, attrs.id, params);
}

const POST_COLUMNS = {
  createdAt:          'created_at',
  updatedAt:          'updated_at',
  bumpedAt:           'bumped_at',
  userId:             'user_id',
  body:               'body',
  commentsDisabled:   'comments_disabled',
  isPrivate:          'is_private',
  isProtected:        'is_protected',
  isPropagable:       'is_propagable',
  feedIntIds:         'feed_ids',
  destinationFeedIds: 'destination_feed_ids',
}

const POST_COLUMNS_MAPPING = {
  createdAt: (timestamp) => {
    const d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  },
  updatedAt: (timestamp) => {
    const d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  },
  bumpedAt: (timestamp) => {
    const d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  },
  commentsDisabled: (comments_disabled) => {return comments_disabled === '1'},
  userId:           (user_id) => {
    if (validator.isUUID(user_id)) {
      return user_id
    }

    return null
  },
  isPrivate:    (is_private) => {return is_private === '1'},
  isProtected:  (is_protected) => {return is_protected === '1'},
  isPropagable: (is_propagable) => {return is_propagable === '1'},
}

export const POST_FIELDS = {
  uid:                  'id',
  created_at:           'createdAt',
  updated_at:           'updatedAt',
  bumped_at:            'bumpedAt',
  user_id:              'userId',
  body:                 'body',
  comments_disabled:    'commentsDisabled',
  feed_ids:             'feedIntIds',
  destination_feed_ids: 'destinationFeedIds',
  comments_count:       'commentsCount',
  likes_count:          'likesCount',
  is_private:           'isPrivate',
  is_protected:         'isProtected',
  is_propagable:        'isPropagable',
  friendfeed_url:       'friendfeedUrl',
}

const POST_FIELDS_MAPPING = {
  created_at:        (time) => { return time.getTime().toString() },
  updated_at:        (time) => { return time.getTime().toString() },
  bumped_at:         (time) => { return time.getTime().toString() },
  comments_disabled: (comments_disabled) => {return comments_disabled ? '1' : '0' },
  user_id:           (user_id) => {return user_id ? user_id : ''},
  is_private:        (is_private) => {return is_private ? '1' : '0' },
  is_protected:      (is_protected) => {return is_protected ? '1' : '0' },
  is_propagable:     (is_propagable) => {return is_propagable ? '1' : '0' },
}

import _ from 'lodash';
import validator from 'validator'
import pgFormat from 'pg-format';

import { Post, Comment } from '../../models';
import { initObject, prepareModelPayload, unexistedUID } from './utils';
import { COMMENT_FIELDS, initCommentObject } from './comments';
import { ATTACHMENT_FIELDS, initAttachmentObject } from './attachments';

///////////////////////////////////////////////////
// Posts
///////////////////////////////////////////////////

const postsTrait = (superClass) => class extends superClass {
  async createPost(payload, destinationsIntIds) {
    const preparedPayload = prepareModelPayload(payload, POST_COLUMNS, POST_COLUMNS_MAPPING)
    preparedPayload.destination_feed_ids = destinationsIntIds
    preparedPayload.feed_ids = destinationsIntIds
    const res = await this.database('posts').returning('uid').insert(preparedPayload)
    return res[0]
  }

  updatePost(postId, payload) {
    const preparedPayload = prepareModelPayload(payload, POST_COLUMNS, POST_COLUMNS_MAPPING)
    return this.database('posts').where('uid', postId).update(preparedPayload)
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
        const { intId } = await this.getUserNamedFeed(commentatorId, 'Comments');
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

  /**
   * Returns integer ids of feeds that user is subscribed to. These ids are
   * separated in two groups: 'destinations' — 'Posts' and 'Directs' feeds and
   * 'activities' — 'Comments' and 'Likes'.
   *
   * @param {String} userId
   * @return {{destinations: number[], activities: number[]}} - ids of feeds
   */
  async getSubscriprionsIntIds(userId) {
    const sql = `
      with feeds as (
        select f.id, f.name from
          subscriptions s join feeds f on f.uid = s.feed_id 
          where s.user_id = :userId
        union  -- viewer's own feeds
          select id, name from feeds where user_id = :userId and name in ('Posts', 'Directs', 'Comments', 'Likes')
      )
      select 
        case when name in ('Comments', 'Likes') then 'activities' else 'destinations' end as type,
        array_agg(id) as ids
      from feeds group by type
    `;
    const { rows } = await this.database.raw(sql, { userId });
    const result = { destinations: [], activities: [] };
    rows.forEach(({ ids, type }) => result[type] = ids);
    return result;
  }

  /**
   * Returns UIDs of timelines posts
   *
   * @param {number[]|null} timelineIntIds null means select everything
   * @param {string|null} viewerId UID of the authenticated viewer
   * @param {object} params
   * @returns {string[]}
   */
  async getTimelinePostsIds(timelineIntIds = null, viewerId = null, params = {}) {
    params = {
      limit:           30,
      offset:          0,
      sort:            'bumped',
      withLocalBumps:  false,
      withoutDirects:  false,
      createdBefore:   null,
      createdAfter:    null,
      activityFeedIds: [],
      authorsIds:      [],
      ...params,
    };

    params.withLocalBumps = params.withLocalBumps && !!viewerId && params.sort === 'bumped';

    // Private feeds viewer can read
    let visiblePrivateFeedIntIds = [];
    // Users who banned viewer or banned by viewer (viewer should not see their posts)
    let  bannedUsersIds = [];
    // Additional condition for params.withoutDirects option
    let noDirectsSQL = 'true';
    let postsAuthorsSQL = null;

    if (viewerId) {
      [
        visiblePrivateFeedIntIds,
        bannedUsersIds,
      ] = await Promise.all([
        this.getVisiblePrivateFeedIntIds(viewerId),
        this.getUsersBansOrWasBannedBy(viewerId),
      ]);

      if (params.withoutDirects) {
        // Do not show directs-only messages (any messages posted to the viewer's 'Directs' feed and to ONE other feed)
        const [directsIntId] = await this.database.pluck('id').from('feeds').where({ user_id: viewerId, name: 'Directs' });
        noDirectsSQL = `not (destination_feed_ids && '{${directsIntId}}' and array_length(destination_feed_ids, 1) = 2)`;
      }

      if (params.authorsIds.length > 0) {
        // Also show posts from these authors
        postsAuthorsSQL = pgFormat('p.user_id in (%L)', params.authorsIds);
      }
    }

    let sourceConditionSQL = 'true'; // select everything

    if (timelineIntIds) {
      const sourceConditionParts = [];
      sourceConditionParts.push(pgFormat('p.feed_ids && %L', `{${timelineIntIds.join(',')}}`));

      if (params.activityFeedIds.length > 0) {
        sourceConditionParts.push(pgFormat('p.feed_ids && %L and p.is_propagable', `{${params.activityFeedIds.join(',')}}`));
      }

      if (postsAuthorsSQL) {
        sourceConditionParts.push(postsAuthorsSQL);
      }

      sourceConditionSQL = `(${sourceConditionParts.join(' or ')})`;
    }

    const createdAtParts = [];

    if (params.createdBefore) {
      createdAtParts.push(pgFormat('p.created_at < %L', params.createdBefore));
    }

    if (params.createdAfter) {
      createdAtParts.push(pgFormat('p.created_at > %L', params.createdAfter));
    }

    const createdAtSQL = createdAtParts.length === 0 ? 'true' : createdAtParts.join(' and ');
    const privacyCondition = viewerId ?
      pgFormat(`(not p.is_private or p.destination_feed_ids && %L)`, `{${visiblePrivateFeedIntIds.join(',')}}`)
      : 'not p.is_protected';
    const bansSQL = bannedUsersIds.length > 0 ?
      pgFormat(`(not p.user_id in (%L))`, bannedUsersIds)
      : 'true';

    const restrictionsSQL = [bansSQL, privacyCondition, noDirectsSQL, createdAtSQL].join(' and ');

    const maxOffsetWithLocalBumps = 1000;
    const smallFeedThreshold = 5;

    /**
     * PostgreSQL is not very good dealing with queries like
     * `select ... from ... where COND order by ORD limit LIM`
     * when COND selects only a small amount of all records. See
     * for example https://stackoverflow.com/a/6038853.
     *
     * So we using a following heuristics here: if feed consists of
     * few (<= 5) source timelines then CTE is used, otherwise
     * normal 'where' is used.
     *
     * @param {number} limit
     * @param {number} offset
     * @param {string} sort
     */
    const getPostsSQL = (limit, offset, sort) => {
      if (timelineIntIds && timelineIntIds.length <= smallFeedThreshold) {
        // Request with CTE for the relatively small feed
        return pgFormat(`
          with posts as (
            select * from posts p where ${sourceConditionSQL}
          )
          select p.uid, p.bumped_at as date
          from 
            posts p
          where
            ${restrictionsSQL}
          order by
            p.%I desc
          limit %L offset %L
        `, `${sort}_at`, limit, offset);
      }

      // Request without CTE for the large (tipically RiverOfNews) feed
      return pgFormat(`
        select p.uid, p.bumped_at as date
        from 
          posts p
        where
          ${sourceConditionSQL} and ${restrictionsSQL}
        order by
          p.%I desc
        limit %L offset %L
      `, `${sort}_at`, limit, offset);
    };

    if (!params.withLocalBumps || params.offset > maxOffsetWithLocalBumps) {
      // without local bumps
      const sql = getPostsSQL(params.limit, params.offset, params.sort);
      return (await this.database.raw(sql)).rows.map((r) => r.uid);
    }

    // with local bumps
    const fullCount = params.limit + params.offset;
    const postsSQL = getPostsSQL(fullCount, 0, 'bumped');
    const localBumpsSQL = pgFormat(`
        with local_bumps as (
          select post_id, min(created_at) as created_at from local_bumps where user_id = %L group by post_id
        )
        select b.post_id as uid, b.created_at as date
        from
          local_bumps b
          join posts p on p.uid = b.post_id
        where
          ${sourceConditionSQL} and ${restrictionsSQL}
        order by b.created_at desc
        limit %L
    `, viewerId, fullCount);

    const [
      { rows: postsData },
      { rows: localBumpsData },
    ] = await Promise.all([
      this.database.raw(postsSQL),
      this.database.raw(localBumpsSQL),
    ]);

    // merge these two sorted arrays
    const result = [];

    {
      const idsCounted = new Set();
      let i = 0, j = 0;

      while (i < postsData.length && j < localBumpsData.length) {
        if (postsData[i].date > localBumpsData[j].date) {
          const { uid } = postsData[i];

          if (!idsCounted.has(uid)) {
            result.push(uid);
            idsCounted.add(uid);
          }

          i++;
        } else {
          const { uid } = localBumpsData[j];

          if (!idsCounted.has(uid)) {
            result.push(uid);
            idsCounted.add(uid);
          }

          j++;
        }
      }

      while (i < postsData.length) {
        const { uid } = postsData[i];

        if (!idsCounted.has(uid)) {
          result.push(uid);
          idsCounted.add(uid);
        }

        i++;
      }

      while (j < localBumpsData.length) {
        const { uid } = localBumpsData[j];

        if (!idsCounted.has(uid)) {
          result.push(uid);
          idsCounted.add(uid);
        }

        j++;
      }
    }

    return result.slice(params.offset, fullCount);
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
  bestPosts = async (currentUser, offset = 0, limit = 30) => {
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

      bannedUsersFilter = this._getPostsFromBannedUsersSearchFilterCondition(iBanned, []);

      if (bannedMe.length > 0) {
        usersWhoBannedMeFilter = pgFormat('AND "feeds"."user_id" NOT IN (%L) ', bannedMe);
      }
    }

    const sql = `
      SELECT
        DISTINCT "posts".* FROM "posts"
      LEFT JOIN (SELECT post_id, COUNT("id") AS "comments_count", COUNT(DISTINCT "user_id") as "comment_authors_count" FROM "comments" GROUP BY "comments"."post_id") AS "c" ON "c"."post_id" = "posts"."uid"
      LEFT JOIN (SELECT post_id, COUNT("id") AS "likes_count" FROM "likes" GROUP BY "likes"."post_id") AS "l" ON "l"."post_id" = "posts"."uid"
      INNER JOIN "feeds" ON "posts"."destination_feed_ids" # feeds.id > 0 AND "feeds"."name" = 'Posts'
      INNER JOIN "users" ON "feeds"."user_id" = "users"."uid" AND ${publicOrVisibleForAnonymous}
      WHERE
        "l"."likes_count" >= ${MIN_LIKES} AND "c"."comments_count" >= ${MIN_COMMENTS} AND "c"."comment_authors_count" >= ${MIN_COMMENT_AUTHORS} AND "posts"."created_at" > (current_date - ${MAX_DAYS} * interval '1 day')
        ${bannedUsersFilter}
        ${usersWhoBannedMeFilter}
      ORDER BY "posts"."bumped_at" DESC
      OFFSET ${offset} LIMIT ${limit}`;

    const res = await this.database.raw(sql);
    return res.rows;
  };

  /**
   * Returns array of objects with the following structure:
   * {
   *   post: <Post object>
   *   destinations: <array of {id (feed UID), name (feed type), user (feed owner UID)}
   *                 objects of posts' destination timelines>
   *   attachments: <array of Attachment objects>
   *   comments: <array of Comments objects>
   *   omittedComments: <number>
   *   likes: <array of liker's UIDs>
   *   omittedLikes: <number>
   * }
   */
  async getPostsWithStuffByIds(postsIds, viewerId = null, params = {}) {
    if (_.isEmpty(postsIds)) {
      return [];
    }

    params = {
      foldComments:        true,
      foldLikes:           true,
      maxUnfoldedComments: 3,
      maxUnfoldedLikes:    4,
      visibleFoldedLikes:  3,
      hiddenCommentTypes:  [],
      ...params,
    };

    const uniqPostsIds = _.uniq(postsIds);

    const postFields = _.without(Object.keys(POST_FIELDS), 'comments_count', 'likes_count', 'friendfeed_url').map((k) => pgFormat('p.%I', k));
    const attFields = Object.keys(ATTACHMENT_FIELDS).map((k) => pgFormat('%I', k));
    const commentFields = Object.keys(COMMENT_FIELDS).map((k) => pgFormat('%I', k));

    const destinationsSQL = pgFormat(`
      with posts as (
        -- unwind all destination_feed_ids from posts
        select distinct
          p.uid,
          unnest(p.destination_feed_ids) as feed_id
        from 
          posts p
        where 
          p.uid in (%L)
      )
      select
        p.uid as post_id, f.uid as id, f.name, f.user_id as user
      from 
        feeds f join posts p on f.id = p.feed_id
    `, uniqPostsIds);

    const [
      bannedUsersIds,
      friendsIds,
      postsData,
      attData,
      { rows: destData },
    ] = await Promise.all([
      viewerId ? this.getUserBansIds(viewerId) : [],
      viewerId ? this.getUserFriendIds(viewerId) : [],
      this.database.select('a.old_url as friendfeed_url', ...postFields).from('posts as p')
        .leftJoin('archive_post_names as a', 'p.uid', 'a.post_id').whereIn('p.uid', uniqPostsIds),
      this.database.select(...attFields).from('attachments').orderBy('ord', 'asc').orderBy('created_at', 'asc').whereIn('post_id', uniqPostsIds),
      this.database.raw(destinationsSQL),
    ]);

    const nobodyIsBanned = bannedUsersIds.length === 0;

    if (nobodyIsBanned) {
      bannedUsersIds.push(unexistedUID);
    }

    if (friendsIds.length === 0) {
      friendsIds.push(unexistedUID);
    }

    const allLikesSQL = pgFormat(`
      select
        post_id, user_id,
        rank() over (partition by post_id order by
          user_id in (%L) desc,
          user_id in (%L) desc,
          created_at desc,
          id desc
        ),
        count(*) over (partition by post_id) 
      from likes
      where post_id in (%L) and user_id not in (%L)
    `, [viewerId], friendsIds, uniqPostsIds, bannedUsersIds);

    const foldLikesSql = params.foldLikes ? pgFormat(`where count <= %L or rank <= %L`, params.maxUnfoldedLikes, params.visibleFoldedLikes) : ``;
    const likesSQL = `
      with likes as (${allLikesSQL})
      select post_id, array_agg(user_id) as likes, count from likes
      ${foldLikesSql}
      group by post_id, count 
    `;

    // Don't show comments that viewer don't want to see
    let hideCommentsSQL = 'true';

    if (params.hiddenCommentTypes.length > 0) {
      if (params.hiddenCommentTypes.includes(Comment.HIDDEN_BANNED) && !nobodyIsBanned) {
        hideCommentsSQL = pgFormat('user_id not in (%L)', bannedUsersIds);
      }

      const ht = params.hiddenCommentTypes.filter((t) => t !== Comment.HIDDEN_BANNED && t !== Comment.VISIBLE);

      if (ht.length > 0) {
        hideCommentsSQL += pgFormat(' and hide_type not in (%L)', ht);
      }
    }

    const viewerIntId = viewerId ? await this._getUserIntIdByUUID(viewerId) : null;


    const allCommentsSQL = pgFormat(`
      select
        ${commentFields.join(', ')}, id,
        rank() over (partition by post_id order by created_at, id),
        count(*) over (partition by post_id),
        (select coalesce(count(*), 0) from comment_likes cl
          where cl.comment_id = comments.id
            and cl.user_id not in (select id from users where uid in (%L))
        ) as c_likes,
        (select true from comment_likes cl
          where cl.comment_id = comments.id
            and cl.user_id = %L
        ) as has_own_like
      from comments
      where post_id in (%L) and (${hideCommentsSQL})
    `, bannedUsersIds, viewerIntId, uniqPostsIds);

    const foldCommentsSql = params.foldComments ? pgFormat(`where count <= %L or rank = 1 or rank = count`, params.maxUnfoldedComments) : ``;
    const commentsSQL = `
      with comments as (${allCommentsSQL})
      select ${commentFields.join(', ')}, id, count, c_likes, has_own_like from comments
      ${foldCommentsSql}
      order by created_at, id
    `;

    const [
      { rows: likesData },
      { rows: commentsData },
    ] = await Promise.all([
      this.database.raw(likesSQL),
      this.database.raw(commentsSQL),
    ]);

    const results = {};

    const postsCommentLikes = await this.getLikesInfoForPosts(uniqPostsIds, viewerId);

    for (const post of postsData) {
      results[post.uid] = {
        post:            initPostObject(post),
        destinations:    [],
        attachments:     [],
        comments:        [],
        omittedComments: 0,
        likes:           [],
        omittedLikes:    0,
      };
      results[post.uid].post.commentLikes = 0;
      results[post.uid].post.ownCommentLikes = 0;
      const commentLikesForPost = postsCommentLikes.find((el) => el.uid === post.uid);

      if (commentLikesForPost) {
        results[post.uid].post.commentLikes = parseInt(commentLikesForPost.post_c_likes_count);
        results[post.uid].post.ownCommentLikes = parseInt(commentLikesForPost.own_c_likes_count);
      }
    }

    for (const dest of destData) {
      results[dest.post_id].destinations.push(_.omit(dest, 'post_id'));
    }

    for (const att of attData) {
      results[att.post_id].attachments.push(initAttachmentObject(att));
    }

    for (const lk of likesData) {
      results[lk.post_id].likes = lk.likes;
      results[lk.post_id].omittedLikes = params.foldLikes ? lk.count - lk.likes.length : 0;
    }

    for (const comm of commentsData) {
      if (!nobodyIsBanned && bannedUsersIds.includes(comm.user_id)) {
        comm.user_id = null;
        comm.hide_type = Comment.HIDDEN_BANNED;
        comm.body = Comment.hiddenBody(Comment.HIDDEN_BANNED);
        comm.c_likes = '0';
        comm.has_own_like = null;
      }

      const comment = initCommentObject(comm);
      comment.likes       = parseInt(comm.c_likes);
      comment.hasOwnLike  = Boolean(comm.has_own_like);
      results[comm.post_id].comments.push(comment);
      results[comm.post_id].omittedComments = (params.foldComments && comm.count > params.maxUnfoldedComments) ? comm.count - 2 : 0;

      if (params.foldComments && results[comm.post_id].omittedComments > 0) {
        let omittedCLikes = results[comm.post_id].post.hasOwnProperty('omittedCommentLikes') ?
          results[comm.post_id].post.omittedCommentLikes :
          results[comm.post_id].post.commentLikes;

        let omittedOwnCLikes = results[comm.post_id].post.hasOwnProperty('omittedOwnCommentLikes') ?
          results[comm.post_id].post.omittedOwnCommentLikes :
          results[comm.post_id].post.ownCommentLikes;

        omittedCLikes -= comment.likes;
        omittedOwnCLikes -= comment.hasOwnLike ? 1 : 0;
        results[comm.post_id].post.omittedCommentLikes = omittedCLikes;
        results[comm.post_id].post.omittedOwnCommentLikes = omittedOwnCLikes;
      } else {
        results[comm.post_id].post.omittedCommentLikes = 0;
        results[comm.post_id].post.omittedOwnCommentLikes = 0;
      }
    }

    for (const post of postsData) {
      if (!results[post.uid].post.hasOwnProperty('omittedCommentLikes')) {
        results[post.uid].post.omittedCommentLikes = 0;
        results[post.uid].post.omittedOwnCommentLikes = 0;
      }
    }

    return postsIds.map((id) => results[id] || null);
  }

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

  async isPostHiddenByUser(postUID, userUID) {
    const { rows } = await this.database.raw(
      `select 1 from 
        feeds f 
        join posts p on p.feed_ids && array[f.id] 
      where p.uid = :postUID and f.user_id = :userUID and f.name = 'Hides' 
      `,
      { postUID, userUID }
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

const POST_FIELDS = {
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

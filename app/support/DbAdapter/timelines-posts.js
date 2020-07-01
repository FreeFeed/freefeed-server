import _ from 'lodash';
import pgFormat from 'pg-format';

import { Comment } from '../../models';
import { List } from '../open-lists';

import { COMMENT_FIELDS, initCommentObject } from './comments';
import { ATTACHMENT_FIELDS, initAttachmentObject } from './attachments';
import { POST_FIELDS, initPostObject } from './posts';
import { sqlIn, sqlIntarrayIn, sqlNotIn, andJoin, orJoin } from './utils';

///////////////////////////////////////////////////
// Posts Select to fill timeline
///////////////////////////////////////////////////

const maxOffsetWithLocalBumps = 1000;
export const smallFeedThreshold = 5;

const timelinesPostsTrait = (superClass) => class extends superClass {
  /**
   * A general posts-selection method that selects posts by selectSQL taking into account
   * all bans and privates visibility of the viewerId.
   */
  async selectPosts({
    viewerId = null,
    limit = 30,
    offset = 0,
    sort = 'bumped',
    withLocalBumps = false,
    wideSelect = false,
    selectSQL = 'true',
  }) {
    withLocalBumps = withLocalBumps && !!viewerId && sort === 'bumped';

    const [
      // Private feeds viewer can read
      visiblePrivateFeedIntIds,
      // Users who banned viewer or banned by viewer (viewer should not see their posts)
      bannedUsersIds,
    ] = await Promise.all([
      viewerId ? this.getVisiblePrivateFeedIntIds(viewerId) : [],
      viewerId ? this.getUsersBansOrWasBannedBy(viewerId) : [],
    ]);

    const restrictionsSQL = andJoin([
      // Privacy
      viewerId
        ? orJoin([
          'not p.is_private',
          sqlIntarrayIn('p.destination_feed_ids', visiblePrivateFeedIntIds),
        ])
        : 'not p.is_protected',
      // Bans
      sqlNotIn('p.user_id', bannedUsersIds),
      // Gone post's authors
      'u.gone_status is null',
    ]);

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
     * @param {number} _limit
     * @param {number} _offset
     * @param {string} _sort
     */
    const getPostsSQL = async (_limit, _offset, _sort) => {
      if (!wideSelect) {
        const pgVersion = await this.getPGVersion();
        // Request with CTE for the relatively small feed
        return pgFormat(`
          with posts as ${pgVersion >= 120000 ? 'materialized' : ''} (
            select p.* from 
              posts p
            where ${selectSQL}
          )
          select p.uid, p.bumped_at as date
          from 
            posts p
            join users u on p.user_id = u.uid
          where
            ${restrictionsSQL}
          order by
            p.%I desc
          limit %L offset %L
        `, `${_sort}_at`, _limit, _offset);
      }

      // Request without CTE for the large (tipically RiverOfNews) feed
      return pgFormat(`
        select p.uid, p.bumped_at as date
        from 
          posts p
          join users u on p.user_id = u.uid
        where
          (${selectSQL}) and (${restrictionsSQL})
        order by
          p.%I desc
        limit %L offset %L
      `, `${_sort}_at`, _limit, _offset);
    };

    if (!withLocalBumps || offset > maxOffsetWithLocalBumps) {
      // without local bumps
      const sql = await getPostsSQL(limit, offset, sort);
      return (await this.database.raw(sql)).rows.map((r) => r.uid);
    }

    // with local bumps
    const fullCount = limit + offset;
    const postsSQL = await getPostsSQL(fullCount, 0, 'bumped');
    const localBumpsSQL = pgFormat(`
        with local_bumps as (
          select post_id, min(created_at) as created_at from local_bumps where user_id = %L group by post_id
        )
        select b.post_id as uid, b.created_at as date
        from
          local_bumps b
          join posts p on p.uid = b.post_id
          join users u on p.user_id = u.uid
        where
          (${selectSQL}) and (${restrictionsSQL})
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

    return result.slice(offset, fullCount);
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
      limit:                30,
      offset:               0,
      sort:                 'bumped',
      withLocalBumps:       false,
      withoutDirects:       false,
      createdBefore:        null,
      createdAfter:         null,
      activityFeedIds:      [],
      // Select only the propagable posts from activity feeds
      activityOnPropagable: true,
      // Hide activity-selected posts if they are posted to these feeds
      activityHideIds:      [],
      authorsIds:           List.everything(),
      ...params,
    };

    params.withLocalBumps = params.withLocalBumps && !!viewerId && params.sort === 'bumped';

    // Additional condition for params.withoutDirects option
    let noDirectsSQL = 'true';

    if (viewerId && params.withoutDirects) {
      // Do not show directs-only messages (any messages posted to the viewer's 'Directs' feed and to ONE other feed)
      const [directsIntId] = await this.database.pluck('id').from('feeds').where({ user_id: viewerId, name: 'Directs' });
      noDirectsSQL = `not (destination_feed_ids && '{${directsIntId}}' and array_length(destination_feed_ids, 1) = 2)`;
    }

    const sourceConditionSQL = timelineIntIds
      ? orJoin([
      // Show posts from destination feeds
        sqlIntarrayIn('p.feed_ids', timelineIntIds),
        andJoin([
        // Show posts from activities
          sqlIntarrayIn('p.feed_ids', params.activityFeedIds),
          // Except of hide list
          sqlIntarrayIn('p.feed_ids', List.inverse(params.activityHideIds)),
          // Probably only propagable posts (classic mode)
          params.activityOnPropagable && 'p.is_propagable',
        ]),
        // Also show posts from these authors (wide mode)
        sqlIn('p.user_id', params.authorsIds),
      ])
      : 'true'; /* Just select everything */

    const selectSQL = andJoin([
      sourceConditionSQL,
      noDirectsSQL,
      // Date filter
      params.createdBefore && pgFormat('p.created_at < %L', params.createdBefore),
      params.createdAfter && pgFormat('p.created_at > %L', params.createdAfter),
    ]);

    return this.selectPosts({
      viewerId,
      limit:          params.limit,
      offset:         params.offset,
      sort:           params.sort,
      withLocalBumps: params.withLocalBumps,
      wideSelect:     timelineIntIds ? timelineIntIds.length > smallFeedThreshold : true,
      selectSQL,
    });
  }

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

    const allLikesSQL = `
      select
        post_id, user_id,
        rank() over (partition by post_id order by
          ${sqlIn('user_id', [viewerId])} desc,
          ${sqlIn('user_id', friendsIds)} desc,
          created_at desc,
          id desc
        ),
        count(*) over (partition by post_id) 
      from likes
      where ${sqlIn('post_id', uniqPostsIds)} and ${sqlNotIn('user_id', bannedUsersIds)}
    `;

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
        hideCommentsSQL = sqlNotIn('user_id', bannedUsersIds);
      }

      const ht = params.hiddenCommentTypes.filter((t) => t !== Comment.HIDDEN_BANNED && t !== Comment.VISIBLE);

      if (ht.length > 0) {
        hideCommentsSQL += ` and ${sqlNotIn('hide_type'), ht}`;
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
            and cl.user_id not in (select id from users where ${sqlIn('uid', bannedUsersIds)})
        ) as c_likes,
        (select true from comment_likes cl
          where cl.comment_id = comments.id
            and cl.user_id = %L
        ) as has_own_like
      from comments
      where ${sqlIn('post_id', uniqPostsIds)} and (${hideCommentsSQL})
    `, viewerIntId);

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
};

export default timelinesPostsTrait;


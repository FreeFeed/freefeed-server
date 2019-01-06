/* eslint babel/semi: "error" */
import _ from 'lodash';
import pgFormat from 'pg-format';

///////////////////////////////////////////////////
// Search
///////////////////////////////////////////////////

const searchTrait = (superClass) => class extends superClass {
  async searchPosts(query, currentUserId, visibleFeedIds, bannedUserIds, offset, limit) {
    const { textSearchConfigName } = this.database.client.config;
    const bannedUsersFilter = this._getPostsFromBannedUsersSearchFilterCondition(bannedUserIds);
    const bannedCommentAuthorFilter = this._getCommentsFromBannedUsersSearchFilterCondition(bannedUserIds);
    const searchCondition = this._getTextSearchCondition(query, textSearchConfigName);
    const commentSearchCondition = this._getCommentSearchCondition(query, textSearchConfigName);
    const publicOrVisibleForAnonymous = currentUserId ? 'not users.is_private' : 'not users.is_protected';

    if (!visibleFeedIds || visibleFeedIds.length == 0) {
      visibleFeedIds = 'NULL';
    }

    const publicPostsSubQuery = 'select "posts".* from "posts" ' +
      'inner join "feeds" on posts.destination_feed_ids # feeds.id > 0 and feeds.name=\'Posts\' ' +
      `inner join "users" on feeds.user_id=users.uid and ${publicOrVisibleForAnonymous} ` +
      `where ${searchCondition} ${bannedUsersFilter}`;

    const publicPostsByCommentsSubQuery = 'select "posts".* from "posts" ' +
      'inner join "feeds" on posts.destination_feed_ids # feeds.id > 0 and feeds.name=\'Posts\' ' +
      `inner join "users" on feeds.user_id=users.uid and ${publicOrVisibleForAnonymous} ` +
      `where
          posts.uid in (
            select post_id from comments where ${commentSearchCondition} ${bannedCommentAuthorFilter}
          ) ${bannedUsersFilter}`;

    let subQueries = [publicPostsSubQuery, publicPostsByCommentsSubQuery];

    if (currentUserId) {
      const myPostsSubQuery = 'select "posts".* from "posts" ' +
        `where "posts"."user_id" = '${currentUserId}' and ${searchCondition}`;

      const myPostsByCommentsSubQuery = 'select "posts".* from "posts" ' +
        `where "posts"."user_id" = '${currentUserId}' and
          posts.uid in (
            select post_id from comments where ${commentSearchCondition} ${bannedCommentAuthorFilter}
          ) `;

      const visiblePrivatePostsSubQuery = 'select "posts".* from "posts" ' +
        'inner join "feeds" on posts.destination_feed_ids # feeds.id > 0 and feeds.name=\'Posts\' ' +
        'inner join "users" on feeds.user_id=users.uid and users.is_private=true ' +
        `where ${searchCondition} and "feeds"."id" in (${visibleFeedIds}) ${bannedUsersFilter}`;

      const visiblePrivatePostsByCommentsSubQuery = 'select "posts".* from "posts" ' +
        'inner join "feeds" on posts.destination_feed_ids # feeds.id > 0 and feeds.name=\'Posts\' ' +
        'inner join "users" on feeds.user_id=users.uid and users.is_private=true ' +
        `where
          posts.uid in (
            select post_id from comments where ${commentSearchCondition} ${bannedCommentAuthorFilter}
          )
          and "feeds"."id" in (${visibleFeedIds}) ${bannedUsersFilter}`;

      subQueries = [...subQueries, myPostsSubQuery, myPostsByCommentsSubQuery, visiblePrivatePostsSubQuery, visiblePrivatePostsByCommentsSubQuery];
    }

    const res = await this.database.raw(
      `select * from (${subQueries.join(' union ')}) as found_posts order by found_posts.bumped_at desc offset ${offset} limit ${limit}`
    );
    return res.rows;
  }

  async searchUserPosts(query, targetUserId, visibleFeedIds, bannedUserIds, offset, limit) {
    const { textSearchConfigName } = this.database.client.config;
    const bannedUsersFilter = this._getPostsFromBannedUsersSearchFilterCondition(bannedUserIds);
    const bannedCommentAuthorFilter = this._getCommentsFromBannedUsersSearchFilterCondition(bannedUserIds);
    const searchCondition = this._getTextSearchCondition(query, textSearchConfigName);
    const commentSearchCondition = this._getCommentSearchCondition(query, textSearchConfigName);

    const publicPostsSubQuery = 'select "posts".* from "posts" ' +
      'inner join "feeds" on posts.destination_feed_ids # feeds.id > 0 and feeds.name=\'Posts\' ' +
      'inner join "users" on feeds.user_id=users.uid and users.is_private=false ' +
      `where ${searchCondition} ${bannedUsersFilter}`;

    const publicPostsByCommentsSubQuery = 'select "posts".* from "posts" ' +
      'inner join "feeds" on posts.destination_feed_ids # feeds.id > 0 and feeds.name=\'Posts\' ' +
      'inner join "users" on feeds.user_id=users.uid and users.is_private=false ' +
      `where
          posts.uid in (
            select post_id from comments where ${commentSearchCondition} ${bannedCommentAuthorFilter}
          ) ${bannedUsersFilter}`;

    let subQueries = [publicPostsSubQuery, publicPostsByCommentsSubQuery];

    if (visibleFeedIds && visibleFeedIds.length > 0) {
      const visiblePrivatePostsSubQuery = 'select "posts".* from "posts" ' +
        'inner join "feeds" on posts.destination_feed_ids # feeds.id > 0 and feeds.name=\'Posts\' ' +
        'inner join "users" on feeds.user_id=users.uid and users.is_private=true ' +
        `where ${searchCondition} and "feeds"."id" in (${visibleFeedIds}) ${bannedUsersFilter}`;

      const visiblePrivatePostsByCommentsSubQuery = 'select "posts".* from "posts" ' +
        'inner join "feeds" on posts.destination_feed_ids # feeds.id > 0 and feeds.name=\'Posts\' ' +
        'inner join "users" on feeds.user_id=users.uid and users.is_private=true ' +
        `where
          posts.uid in (
            select post_id from comments where ${commentSearchCondition} ${bannedCommentAuthorFilter}
          )
          and "feeds"."id" in (${visibleFeedIds}) ${bannedUsersFilter}`;

      subQueries = [...subQueries, visiblePrivatePostsSubQuery, visiblePrivatePostsByCommentsSubQuery];
    }

    const res = await this.database.raw(
      `select * from (${subQueries.join(' union ')}) as found_posts where found_posts.user_id='${targetUserId}' order by found_posts.bumped_at desc offset ${offset} limit ${limit}`
    );
    return res.rows;
  }

  async searchGroupPosts(query, groupFeedId, visibleFeedIds, bannedUserIds, offset, limit) {
    const { textSearchConfigName } = this.database.client.config;
    const bannedUsersFilter = this._getPostsFromBannedUsersSearchFilterCondition(bannedUserIds);
    const bannedCommentAuthorFilter = this._getCommentsFromBannedUsersSearchFilterCondition(bannedUserIds);
    const searchCondition = this._getTextSearchCondition(query, textSearchConfigName);
    const commentSearchCondition = this._getCommentSearchCondition(query, textSearchConfigName);

    if (!visibleFeedIds || visibleFeedIds.length == 0) {
      visibleFeedIds = 'NULL';
    }

    const publicPostsSubQuery = 'select "posts".* from "posts" ' +
      `inner join "feeds" on posts.destination_feed_ids # feeds.id > 0 and feeds.name='Posts' and feeds.uid='${groupFeedId}' ` +
      'inner join "users" on feeds.user_id=users.uid and users.is_private=false ' +
      `where ${searchCondition} ${bannedUsersFilter}`;

    const publicPostsByCommentsSubQuery = 'select "posts".* from "posts" ' +
      `inner join "feeds" on posts.destination_feed_ids # feeds.id > 0 and feeds.name='Posts' and feeds.uid='${groupFeedId}' ` +
      'inner join "users" on feeds.user_id=users.uid and users.is_private=false ' +
      `where
          posts.uid in (
            select post_id from comments where ${commentSearchCondition} ${bannedCommentAuthorFilter}
          ) ${bannedUsersFilter}`;

    let subQueries = [publicPostsSubQuery, publicPostsByCommentsSubQuery];

    if (visibleFeedIds && visibleFeedIds.length > 0) {
      const visiblePrivatePostsSubQuery = 'select "posts".* from "posts" ' +
        `inner join "feeds" on posts.destination_feed_ids # feeds.id > 0 and feeds.name='Posts' and feeds.uid='${groupFeedId}' ` +
        'inner join "users" on feeds.user_id=users.uid and users.is_private=true ' +
        `where ${searchCondition} and "feeds"."id" in (${visibleFeedIds}) ${bannedUsersFilter}`;

      const visiblePrivatePostsByCommentsSubQuery = 'select "posts".* from "posts" ' +
        `inner join "feeds" on posts.destination_feed_ids # feeds.id > 0 and feeds.name='Posts' and feeds.uid='${groupFeedId}' ` +
        'inner join "users" on feeds.user_id=users.uid and users.is_private=true ' +
        `where
          posts.uid in (
            select post_id from comments where ${commentSearchCondition} ${bannedCommentAuthorFilter}
          )
          and "feeds"."id" in (${visibleFeedIds}) ${bannedUsersFilter}`;

      subQueries = [...subQueries, visiblePrivatePostsSubQuery, visiblePrivatePostsByCommentsSubQuery];
    }

    const res = await this.database.raw(
      `select * from (${subQueries.join(' union ')}) as found_posts order by found_posts.bumped_at desc offset ${offset} limit ${limit}`
    );
    return res.rows;
  }

  _getPostsFromBannedUsersSearchFilterCondition(bannedUserIds) {
    if (bannedUserIds.length === 0) {
      return '';
    }

    return pgFormat('and posts.user_id not in (%L) ', bannedUserIds);
  }

  _getCommentsFromBannedUsersSearchFilterCondition(bannedUserIds) {
    if (bannedUserIds.length === 0) {
      return '';
    }

    return pgFormat(`and comments.user_id not in (%L) `, bannedUserIds);
  }

  _getTextSearchCondition(parsedQuery, textSearchConfigName) {
    const searchConditions = [];

    if (parsedQuery.query.length > 2) {
      const sql = pgFormat(`to_tsvector(%L, posts.body) @@ to_tsquery(%L, %L)`, textSearchConfigName, textSearchConfigName, parsedQuery.query);
      searchConditions.push(sql);
    }

    if (parsedQuery.quotes.length > 0) {
      const quoteConditions = parsedQuery.quotes.map((quote) => {
        const regex = `([[:<:]]|\\W|^)${_.escapeRegExp(quote)}([[:>:]]|\\W|$)`;
        return pgFormat(`posts.body ~ %L`, regex);
      });
      searchConditions.push(`${quoteConditions.join(' and ')}`);
    }

    if (parsedQuery.hashtags.length > 0) {
      const hashtagConditions = parsedQuery.hashtags.map((tag) => {
        return pgFormat(`posts.uid in (
            select u.entity_id from hashtag_usages as u where u.hashtag_id in (
              select hashtags.id from hashtags where hashtags.name = %L
            ) and u.type = 'post'
          )`, tag);
      });

      searchConditions.push(`${hashtagConditions.join(' and ')}`);
    }

    if (searchConditions.length == 0) {
      return ' 1=0 ';
    }

    return `${searchConditions.join(' and ')} `;
  }

  _getCommentSearchCondition(parsedQuery, textSearchConfigName) {
    const searchConditions = [];

    if (parsedQuery.query.length > 2) {
      const sql = pgFormat(`to_tsvector(%L, comments.body) @@ to_tsquery(%L, %L)`, textSearchConfigName, textSearchConfigName, parsedQuery.query);
      searchConditions.push(sql);
    }

    if (parsedQuery.quotes.length > 0) {
      const quoteConditions = parsedQuery.quotes.map((quote) => {
        const regex = `([[:<:]]|\\W|^)${_.escapeRegExp(quote)}([[:>:]]|\\W|$)`;
        return pgFormat(`comments.body ~ %L`, regex);
      });
      searchConditions.push(`${quoteConditions.join(' and ')}`);
    }

    if (parsedQuery.hashtags.length > 0) {
      const hashtagConditions = parsedQuery.hashtags.map((tag) => {
        return pgFormat(`comments.uid in (
            select u.entity_id from hashtag_usages as u where u.hashtag_id in (
              select hashtags.id from hashtags where hashtags.name = %L
            ) and u.type = 'comment'
          )`, tag);
      });

      searchConditions.push(`${hashtagConditions.join(' and ')}`);
    }

    if (searchConditions.length == 0) {
      return ' 1=0 ';
    }

    return `${searchConditions.join(' and ')} `;
  }
};

export default searchTrait;

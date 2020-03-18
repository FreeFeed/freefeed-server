import { uniq } from 'lodash';
import config from 'config';
import createDebug from 'debug';
import pgFormat from 'pg-format';

import { parseQuery, queryComplexity } from '../search/parser';
import {
  IN_POSTS,
  IN_COMMENTS,
  Condition,
  IN_ALL,
  ScopeStart,
  AnyText,
  InScope
} from '../search/query-tokens';
import { List } from '../open-lists';
import { Comment } from '../../models';

import { sqlIn, sqlNotIn, sqlIntarrayIn } from './utils';
import { smallFeedThreshold } from './timelines-posts';

///////////////////////////////////////////////////
// Search
///////////////////////////////////////////////////

const debug = createDebug('freefeed:searchEngine');

const searchTrait = (superClass) =>
  class extends superClass {
    async search(
      query,
      {
        viewerId = null,
        limit = 30,
        offset = 0,
        sort = 'bumped',
        maxQueryComplexity = config.search.maxQueryComplexity
      } = {}
    ) {
      const parsedQuery = parseQuery(query);

      if (queryComplexity(parsedQuery) > maxQueryComplexity) {
        throw new Error(`The search query is too complex, try to simplify it`);
      }

      if (
        !viewerId &&
        parsedQuery.some((t) => t instanceof Condition && t.condition === 'in-my')
      ) {
        throw new Error(`Please sign in to use 'in-my:' filter`);
      }

      /**
       * There are three search scopes:
       * - IN_ALL (search something in posts OR in comments)
       * - IN_POSTS (search something in posts only)
       * - IN_COMMENTS (search something in comments only)
       *
       * These scopes produces a corresponding SQL-queries that joins by AND. IN_ALL query, in turn,
       * consists of two sub-queries, for 'posts' and for 'comments' tables, joined by OR.
       */

      // Map from username to User/Group object (or null)
      const accounts = await this._getAccountsUsedInQuery(
        parsedQuery,
        viewerId
      );

      // Authorship
      const allContentAuthors = getAuthorNames(parsedQuery, IN_ALL);
      let postAuthors = getAuthorNames(parsedQuery, IN_POSTS);
      const commentAuthors = getAuthorNames(parsedQuery, IN_COMMENTS);

      for (const list of [allContentAuthors, postAuthors, commentAuthors]) {
        list.items = list.items
          .map((name) => accounts[name] && accounts[name].id)
          .filter(Boolean);
      }

      // Posts feeds
      const postsFeedIdsLists = await this._getFeedIdsLists(
        parsedQuery,
        accounts
      );

      // Special case: in-my:discussions
      //
      // The in-my:discussions filter is effectively a "commented-by:me | liked-by:me |
      // posts-from:me". But the first two parts are feeds and the last is an authorship, so we can
      // not express this in one simple form and must process the "| posts-from:me" part separately.
      let orPostsFromMe = false;

      for (const token of parsedQuery) {
        if (
          token instanceof Condition &&
          token.condition === 'in-my' &&
          token.args.some((a) => /discussion/.test(a))
        ) {
          if (token.exclude) {
            // ! (| posts-from:me) === & (!posts-from:me)
            postAuthors = List.intersection(
              postAuthors,
              new List([viewerId], false)
            );
          } else {
            orPostsFromMe = true;
          }
        }
      }

      // Text search
      const inAllTSQuery = getTSQuery(parsedQuery, IN_ALL);
      const inPostsTSQuery = getTSQuery(parsedQuery, IN_POSTS);
      const inCommentsTSQuery = getTSQuery(parsedQuery, IN_COMMENTS);

      // Create partial SQL queries
      const inAllPostsSQL = andJoin([
        inAllTSQuery && `p.body_tsvector @@ ${inAllTSQuery}`,
        sqlIn('p.user_id', allContentAuthors)
      ]);

      let inAllCommentsSQL = andJoin([
        inAllTSQuery && `c.body_tsvector @@ ${inAllTSQuery}`,
        sqlIn('c.user_id', allContentAuthors)
      ]);

      const inPostsSQL = andJoin([
        inPostsTSQuery && `p.body_tsvector @@ ${inPostsTSQuery}`,
        sqlIn('p.user_id', postAuthors),
        orJoin(
          [
            andJoin([
              ...postsFeedIdsLists.map((list) =>
                sqlIntarrayIn('p.feed_ids', list)
              )
            ]),
            // Special hack for in-my:discussions
            orPostsFromMe && pgFormat('p.user_id=%L', viewerId)
          ],
          'true'
        )
      ]);

      let inCommentsSQL = andJoin([
        inCommentsTSQuery && `c.body_tsvector @@ ${inCommentsTSQuery}`,
        sqlIn('c.user_id', commentAuthors)
      ]);

      // Are we using the 'comments' table?
      const useCommentsTable =
        inAllCommentsSQL !== 'true' || inCommentsSQL !== 'true';

      // Additional restrictions for comments
      if (useCommentsTable) {
        const bannedByViewer = viewerId
          ? await this.getUserBansIds(viewerId)
          : [];
        const commentsRestrictionSQL = andJoin([
          pgFormat('c.hide_type=%L', Comment.VISIBLE),
          sqlNotIn('c.user_id', bannedByViewer)
        ]);

        if (inAllCommentsSQL !== 'true') {
          inAllCommentsSQL = andJoin([
            inAllCommentsSQL,
            commentsRestrictionSQL
          ]);
        }

        if (inCommentsSQL !== 'true') {
          inCommentsSQL = andJoin([inCommentsSQL, commentsRestrictionSQL]);
        }
      }

      // Build the final query
      const inAllSQL = orJoin([inAllPostsSQL, inAllCommentsSQL]);
      const selectSQL = andJoin([
        inAllSQL !== 'true' && `(${inAllSQL})`,
        inPostsSQL,
        inCommentsSQL
      ]);

      debug('selectSQL:', selectSQL);

      // wideSelect heuristics
      let wideSelect = false;

      for (const authors of [allContentAuthors, postAuthors]) {
        // Selection is 'wide' if post authors list is infinite
        wideSelect =
          wideSelect || (!authors.inclusive && authors.items.length > 0);
      }

      for (const feeds of postsFeedIdsLists) {
        // Selection is 'wide' if feeds list have more than smallFeedThreshold items
        wideSelect =
          wideSelect ||
          (!feeds.inclusive && feeds.items.length > 0) ||
          feeds.items.length > smallFeedThreshold;
      }

      return await this.selectPosts({
        viewerId,
        limit,
        offset,
        sort,
        selectSQL,
        useCommentsTable,
        wideSelect
      });
    }

    async _getAccountsUsedInQuery(parsedQuery, viewerId) {
      const conditionsWithAccNames = [
        'in',
        'commented-by',
        'liked-by',
        'from',
        'comments-from',
        'posts-from'
      ];

      const accounts = {}; // Map from username to User/Group object (or null)

      let accountNames = [];
      viewerId && accountNames.push('me');

      for (const token of parsedQuery) {
        if (
          token instanceof Condition &&
          conditionsWithAccNames.includes(token.condition)
        ) {
          accountNames.push(...token.args);
        }
      }

      accountNames = uniq(accountNames);

      let meUser = null;

      if (accountNames.includes('me')) {
        if (!viewerId) {
          throw new Error(`Please sign in to use 'me' as username`);
        }

        meUser = await this.getFeedOwnerById(viewerId);
      }

      const accountObjects = await this.getFeedOwnersByUsernames(accountNames);

      for (const ao of accountObjects) {
        accounts[ao.username] = ao;
      }

      for (const name of accountNames) {
        if (name === 'me') {
          accounts[name] = meUser;
        } else if (!accounts[name]) {
          accounts[name] = null;
        }
      }

      return accounts;
    }

    /**
     * Post can belongs to many feeds, so this function returns an array of Lists of feed intId's.
     *
     * @param {Array} tokens
     * @param {Object} accountsMap
     * @returns {Promise<Array>}
     */
    async _getFeedIdsLists(tokens, accountsMap) {
      const condToFeedNames = {
        in:             'Posts',
        'commented-by': 'Comments',
        'liked-by':     'Likes'
      };
      const myFeedNames = ['saves', 'directs', 'discussions', 'friends'];

      return await Promise.all(
        tokens
          .filter(
            (t) =>
              t instanceof Condition &&
              (!!condToFeedNames[t.condition] || t.condition === 'in-my')
          )
          .map(async (t) => {
            if (condToFeedNames[t.condition]) {
              const userIds = uniq(t.args)
                .map((n) => accountsMap[n] && accountsMap[n].id)
                .filter(Boolean);

              const feedIntIds = await this.getUsersNamedFeedsIntIds(userIds, [
                condToFeedNames[t.condition]
              ]);
              return new List(feedIntIds, !t.exclude);
            }

            // in-my:
            const currentUser = accountsMap['me'];
            const feedIntIds = await Promise.all(
              uniq(t.args)
                .map((n) => (/s$/i.test(n) ? n : `${n}s`))
                .filter((n) => myFeedNames.includes(n))
                .map(async (name) => {
                  switch (name) {
                    case 'saves': {
                      return [
                        await currentUser.getGenericTimelineIntId('Saves')
                      ];
                    }
                    case 'directs': {
                      return [
                        await currentUser.getGenericTimelineIntId('Directs')
                      ];
                    }
                    case 'discussions': {
                      return await Promise.all([
                        currentUser.getCommentsTimelineIntId(),
                        currentUser.getLikesTimelineIntId()
                      ]);
                    }
                    case 'friends': {
                      const { destinations } = await this.getSubscriprionsIntIds(currentUser.id);
                      return destinations;
                    }
                  }

                  return [];
                })
            );
            return new List(feedIntIds, !t.exclude);
          })
      );
    }
  };

export default searchTrait;

function andJoin(array, def = 'true') {
  if (array.some((x) => x === 'false')) {
    return 'false';
  }

  return array.filter((x) => !!x && x !== 'true').join(' and ') || def;
}

function orJoin(array, def = 'false') {
  if (array.some((x) => x === 'true')) {
    return 'true';
  }

  return array.filter((x) => !!x && x !== 'false').join(' or ') || def;
}

function walkWithScope(tokens, action) {
  let currentScope = IN_ALL;

  for (const token of tokens) {
    if (token instanceof ScopeStart) {
      currentScope = token.scope;
      continue;
    }

    action(token, currentScope);
  }
}

function getTSQuery(tokens, targetScope) {
  const result = [];

  walkWithScope(tokens, (token, currentScope) => {
    if (token instanceof AnyText && currentScope === targetScope) {
      result.push(token.toTSQuery());
    }

    if (token instanceof InScope && token.scope === targetScope) {
      result.push(...token.anyTexts.map((t) => t.toTSQuery()));
    }
  });

  return result.length > 1 ? `(${result.join(' && ')})` : result.join(' && ');
}

function getAuthorNames(tokens, targetScope) {
  let result = List.everything();

  walkWithScope(tokens, (token, currentScope) => {
    if (
      token instanceof Condition &&
      ((token.condition === 'comments-from' && targetScope === IN_COMMENTS) ||
        (token.condition === 'posts-from' && targetScope === IN_POSTS) ||
        (token.condition === 'from' && targetScope === currentScope))
    ) {
      result = List.intersection(
        result,
        token.exclude ? List.inverse(token.args) : token.args
      );
    }
  });

  return result;
}

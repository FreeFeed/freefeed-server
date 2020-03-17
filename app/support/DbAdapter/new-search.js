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

import { sqlIn, sqlNotIn } from './utils';

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

      // TODO: support all conditions

      // Authorship
      const allContentAuthors = getAuthorNames(parsedQuery, IN_ALL);
      const postAuthors = getAuthorNames(parsedQuery, IN_POSTS);
      const commentAuthors = getAuthorNames(parsedQuery, IN_COMMENTS);

      for (const list of [allContentAuthors, postAuthors, commentAuthors]) {
        list.items = list.items
          .map((name) => accounts[name] && accounts[name].id)
          .filter(Boolean);
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
        sqlIn('p.user_id', postAuthors)
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

      // TODO: wideSelect
      return await this.selectPosts({
        viewerId,
        limit,
        offset,
        sort,
        selectSQL,
        useCommentsTable
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

export function getAuthorNames(tokens, targetScope) {
  let result = List.everything();

  walkWithScope(tokens, (token, currentScope) => {
    if (
      (token.condition === 'comments-from' && targetScope === IN_COMMENTS) ||
      (token.condition === 'posts-from' && targetScope === IN_POSTS) ||
      (token.condition === 'from' && targetScope === currentScope)
    ) {
      result = List.intersection(
        result,
        token.exclude ? List.inverse(token.args) : token.args
      );
    }
  });

  return result;
}

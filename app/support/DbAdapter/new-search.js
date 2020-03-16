import { uniq } from 'lodash';
import config from 'config';
import createDebug from 'debug';

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

///////////////////////////////////////////////////
// Search
///////////////////////////////////////////////////

const conditionsWithAccNames = [
  'in',
  'commented-by',
  'liked-by',
  'from',
  'comments-from',
  'posts-from'
];

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

      if (accountNames.includes('me') && !viewerId) {
        throw new Error(`Please sign in to use 'me' as username`);
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

      const inAllTSQuery = getTSQuery(parsedQuery, IN_ALL);
      const inPostsTSQuery = getTSQuery(parsedQuery, IN_POSTS);
      const inCommentsTSQuery = getTSQuery(parsedQuery, IN_COMMENTS);

      // TODO: support conditions

      const inAllPostsSQL = joinBy(' and ', [
        inAllTSQuery && `p.body_tsvector @@ ${inAllTSQuery}`
      ]);

      const inAllCommentsSQL = joinBy(' and ', [
        inAllTSQuery && `c.body_tsvector @@ ${inAllTSQuery}`
      ]);

      const inAllSQL = joinBy(' or ', [inAllPostsSQL, inAllCommentsSQL]);

      const inPostsSQL = joinBy(' and ', [
        inPostsTSQuery && `p.body_tsvector @@ ${inPostsTSQuery}`
      ]);

      const inCommentsSQL = joinBy(' and ', [
        inCommentsTSQuery && `c.body_tsvector @@ ${inCommentsTSQuery}`
      ]);

      const selectSQL =
        joinBy(' and ', [
          inAllSQL && `(${inAllSQL})`,
          inPostsSQL,
          inCommentsSQL
        ]) || 'true';

      debug('selectSQL:', selectSQL);

      const useCommentsTable =
        (inAllCommentsSQL && inAllCommentsSQL !== 'true') ||
        (inCommentsSQL && inCommentsSQL !== 'true');

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
  };

export default searchTrait;

function joinBy(glue, array) {
  return array.filter(Boolean).join(glue);
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

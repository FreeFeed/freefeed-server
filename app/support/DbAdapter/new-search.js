import { uniq } from 'lodash';
import config from 'config';

import { parseQuery, queryComplexity } from '../search/parser';
import { toTSQuery } from '../search/to-tsquery';
import { IN_POSTS, IN_COMMENTS, Condition } from '../search/query-tokens';

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

      // TODO: support conditions
      const postsTSVQuery = toTSQuery(parsedQuery, IN_POSTS);
      const commentsTSVQuery = toTSQuery(parsedQuery, IN_COMMENTS);

      let postsSQL = postsTSVQuery && `p.body_tsvector @@ (${postsTSVQuery})`;
      const commentsSQL =
        commentsTSVQuery && `c.body_tsvector @@ (${commentsTSVQuery})`;

      if (!postsSQL) {
        // Selecting only by comments conditions or just return all posts if no
        // restrictions for comments.
        postsSQL = commentsSQL ? 'false' : 'true';
      }

      // TODO: wideSelect
      return await this.selectPosts({
        viewerId,
        limit,
        offset,
        sort,
        selectSQL:         postsSQL,
        commentsSelectSQL: commentsSQL
      });
    }
  };

export default searchTrait;

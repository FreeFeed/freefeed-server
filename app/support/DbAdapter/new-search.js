import { parseQuery } from '../search/parser';
import { toTSQuery } from '../search/to-tsquery';
import { IN_POSTS, IN_COMMENTS } from '../search/query-tokens';

///////////////////////////////////////////////////
// Search
///////////////////////////////////////////////////

const searchTrait = (superClass) =>
  class extends superClass {
    async search(
      query,
      { viewerId = null, limit = 30, offset = 0, sort = 'bumped' } = {}
    ) {
      const parsedQuery = parseQuery(query);
      // TODO: check complexity
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

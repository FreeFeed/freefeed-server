import { Comment } from '../../models';
import { extractShortIds, extractUUIDs } from '../backlinks';

///////////////////////////////////////////////////
// Backlinks
///////////////////////////////////////////////////

const backlinksTrait = (superClass) =>
  class extends superClass {
    async getBacklinksCounts(uids, viewerId = null) {
      const result = new Map();

      let backlinksData = await this.database.getAll(
        `select * from backlinks where post_id = any(:uids)`,
        { uids },
      );

      // Don't count backlinks to the post itself
      backlinksData = backlinksData.filter((d) => d.post_id !== d.ref_post_id);

      if (backlinksData.length === 0) {
        return result;
      }

      const allPosts = backlinksData.map((d) => d.ref_post_id);
      const visiblePosts = await this.selectPostsVisibleByUser(allPosts, viewerId);
      // Keep only the visible posts
      backlinksData = backlinksData.filter((d) => visiblePosts.includes(d.ref_post_id));

      const allComments = backlinksData.map((d) => d.ref_comment_id).filter(Boolean);

      if (allComments.length > 0) {
        const bannedByViewer = viewerId ? await this.getUserBansIds(viewerId) : [];
        const visibleComments = await this.database.getCol(
          `select uid from comments where
            uid = any(:allComments) 
            and hide_type = :visible 
            and not (user_id = any(:bannedByViewer))
            `,
          { allComments, bannedByViewer, visible: Comment.VISIBLE },
        );
        // Keep only the visible comments
        backlinksData = backlinksData.filter(
          (d) => !d.ref_comment_id || visibleComments.includes(d.ref_comment_id),
        );
      }

      for (const { post_id } of backlinksData) {
        result.set(post_id, (result.get(post_id) || 0) + 1);
      }

      return result;
    }

    async updateBacklinks(text, refPostUID, refCommentUID = null, db = this.database) {
      const uuids = await db.getCol(
        `SELECT long_id FROM post_short_ids WHERE long_id = ANY(?) OR (short_id = ANY(?) AND long_id IS NOT NULL)`,
        [extractUUIDs(text), extractShortIds(text)],
      );

      // Remove the old backlinks
      if (refCommentUID) {
        await db.raw(
          `delete from backlinks where (ref_post_id, ref_comment_id) = (:refPostUID, :refCommentUID)`,
          { refPostUID, refCommentUID },
        );
      } else {
        await db.raw(
          `delete from backlinks where ref_post_id = :refPostUID and ref_comment_id is null`,
          {
            refPostUID,
          },
        );
      }

      if (uuids.length === 0) {
        return;
      }

      // Insert the new backlinks
      await db.raw(
        `insert into backlinks (post_id, ref_post_id, ref_comment_id)
        select post_id, :refPostUID, :refCommentUID from unnest(:uuids::uuid[]) post_id
        on conflict do nothing`,
        { uuids, refPostUID, refCommentUID },
      );
    }
  };

export default backlinksTrait;

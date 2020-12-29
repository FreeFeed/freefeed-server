import _ from 'lodash';
import pgFormat from 'pg-format';

///////////////////////////////////////////////////
// Hashtags
///////////////////////////////////////////////////

const hashtagsTrait = (superClass) =>
  class extends superClass {
    async getHashtagIdsByNames(names) {
      if (!names || names.length == 0) {
        return [];
      }

      const lowerCaseNames = names.map((hashtag) => {
        return hashtag.toLowerCase();
      });

      const res = await this.database('hashtags')
        .select('id', 'name')
        .where('name', 'in', lowerCaseNames);
      return res.map((t) => t.id);
    }

    async getOrCreateHashtagIdsByNames(names) {
      if (!names || names.length == 0) {
        return [];
      }

      const lowerCaseNames = names.map((hashtag) => {
        return hashtag.toLowerCase();
      });

      const targetTagNames = _.sortBy(lowerCaseNames);
      const existingTags = await this.database('hashtags')
        .select('id', 'name')
        .where('name', 'in', targetTagNames);
      const existingTagNames = _.sortBy(existingTags.map((t) => t.name));

      const nonExistingTagNames = _.difference(targetTagNames, existingTagNames);
      let tags = existingTags.map((t) => t.id);

      if (nonExistingTagNames.length > 0) {
        const createdTags = await this.createHashtags(nonExistingTagNames);

        if (createdTags.length > 0) {
          tags = tags.concat(createdTags);
        }
      }

      return tags;
    }

    getPostHashtags(postId) {
      return this.database
        .select('hashtags.id', 'hashtags.name')
        .from('hashtags')
        .join('hashtag_usages', { 'hashtag_usages.hashtag_id': 'hashtags.id' })
        .where('hashtag_usages.entity_id', '=', postId)
        .andWhere('hashtag_usages.type', 'post');
    }

    getCommentHashtags(commentId) {
      return this.database
        .select('hashtags.id', 'hashtags.name')
        .from('hashtags')
        .join('hashtag_usages', { 'hashtag_usages.hashtag_id': 'hashtags.id' })
        .where('hashtag_usages.entity_id', '=', commentId)
        .andWhere('hashtag_usages.type', 'comment');
    }

    async createHashtags(names) {
      if (!names || names.length == 0) {
        return [];
      }

      const payload = names
        .map((name) => {
          return pgFormat(`(%L)`, name.toLowerCase());
        })
        .join(',');
      const res = await this.database.raw(
        `insert into hashtags ("name") values ${payload} on conflict do nothing returning "id" `,
      );
      return res.rows.map((t) => t.id);
    }

    linkHashtags(tagIds, entityId, toPost = true) {
      if (tagIds.length == 0) {
        return false;
      }

      const entityType = toPost ? 'post' : 'comment';
      const payload = tagIds
        .map((hashtagId) => {
          return pgFormat(`(%L, %L, %L)`, hashtagId, entityId, entityType);
        })
        .join(',');

      return this.database.raw(
        `insert into hashtag_usages ("hashtag_id", "entity_id", "type") values ${payload} on conflict do nothing`,
      );
    }

    unlinkHashtags(tagIds, entityId, fromPost = true) {
      if (tagIds.length == 0) {
        return false;
      }

      let entityType = 'post';

      if (!fromPost) {
        entityType = 'comment';
      }

      return this.database('hashtag_usages')
        .where('hashtag_id', 'in', tagIds)
        .where('entity_id', entityId)
        .where('type', entityType)
        .del();
    }

    async linkPostHashtagsByNames(names, postId) {
      if (!names || names.length == 0) {
        return false;
      }

      const hashtagIds = await this.getOrCreateHashtagIdsByNames(names);

      if (!hashtagIds || hashtagIds.length == 0) {
        return false;
      }

      return this.linkHashtags(hashtagIds, postId);
    }

    async unlinkPostHashtagsByNames(names, postId) {
      if (!names || names.length == 0) {
        return false;
      }

      const hashtagIds = await this.getHashtagIdsByNames(names);

      if (!hashtagIds || hashtagIds.length == 0) {
        return false;
      }

      return this.unlinkHashtags(hashtagIds, postId);
    }

    async linkCommentHashtagsByNames(names, commentId) {
      if (!names || names.length == 0) {
        return false;
      }

      const hashtagIds = await this.getOrCreateHashtagIdsByNames(names);

      if (!hashtagIds || hashtagIds.length == 0) {
        return false;
      }

      return this.linkHashtags(hashtagIds, commentId, false);
    }

    async unlinkCommentHashtagsByNames(names, commentId) {
      if (!names || names.length == 0) {
        return false;
      }

      const hashtagIds = await this.getHashtagIdsByNames(names);

      if (!hashtagIds || hashtagIds.length == 0) {
        return false;
      }

      return this.unlinkHashtags(hashtagIds, commentId, false);
    }
  };

export default hashtagsTrait;

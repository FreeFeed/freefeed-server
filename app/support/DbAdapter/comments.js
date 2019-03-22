import validator from 'validator'

import { Comment } from '../../models';
import { initObject, prepareModelPayload } from './utils';

///////////////////////////////////////////////////
// Comments
///////////////////////////////////////////////////

const commentsTrait = (superClass) => class extends superClass {
  async createComment(payload) {
    const preparedPayload = prepareModelPayload(payload, COMMENT_COLUMNS, COMMENT_COLUMNS_MAPPING)
    const res = await this.database('comments').returning('uid').insert(preparedPayload)
    return res[0]
  }

  async getCommentById(id) {
    if (!validator.isUUID(id)) {
      return null
    }

    const attrs = await this.database('comments').first().where('uid', id)
    return initCommentObject(attrs);
  }

  getCommentsIdsByIntIds(intIds) {
    return this.database('comments').select('id', 'uid').whereIn('id', intIds);
  }

  async _getCommentIntIdByUUID(commentUUID) {
    if (!validator.isUUID(commentUUID)) {
      return null;
    }

    const res = await this.database('comments').returning('id').first().where('uid', commentUUID);

    if (!res) {
      return null;
    }

    return res.id;
  }

  updateComment(commentId, payload) {
    const preparedPayload = prepareModelPayload(payload, COMMENT_COLUMNS, COMMENT_COLUMNS_MAPPING)

    return this.database('comments').where('uid', commentId).update(preparedPayload)
  }

  deleteComment(commentId, postId) {
    return this.database('comments').where({
      uid:     commentId,
      post_id: postId
    }).delete()
  }

  async getPostCommentsCount(postId) {
    const res = await this.database('comments').where({ post_id: postId }).count()
    return parseInt(res[0].count)
  }

  async getUserCommentsCount(userId) {
    const res = await this.database('comments').where({ user_id: userId }).count()
    return parseInt(res[0].count)
  }

  async getAllPostCommentsWithoutBannedUsers(postId, viewerUserId) {
    let query = this.database('comments').orderBy('created_at', 'asc').where('post_id', postId);

    const [
      viewer,
      bannedUsersIds,
    ] = await Promise.all([
      viewerUserId ? this.getUserById(viewerUserId) : null,
      viewerUserId ? this.getUserBansIds(viewerUserId) : [],
    ]);

    if (viewerUserId) {
      const hiddenCommentTypes = viewer.getHiddenCommentTypes();

      if (hiddenCommentTypes.length > 0) {
        if (hiddenCommentTypes.includes(Comment.HIDDEN_BANNED) && bannedUsersIds.length > 0) {
          query = query.where('user_id', 'not in', bannedUsersIds);
        }

        const ht = hiddenCommentTypes.filter((t) => t !== Comment.HIDDEN_BANNED && t !== Comment.VISIBLE);

        if (ht.length > 0) {
          query = query.where('hide_type', 'not in', ht);
        }
      }
    }

    const responses = await query;
    const comments = responses
      .map((comm) => {
        if (bannedUsersIds.includes(comm.user_id)) {
          comm.user_id = null;
          comm.hide_type = Comment.HIDDEN_BANNED;
          comm.body = Comment.hiddenBody(Comment.HIDDEN_BANNED);
        }

        return comm;
      });
    return comments.map(initCommentObject);
  }

  _deletePostComments(postId) {
    return this.database('comments').where({ post_id: postId }).delete()
  }

  // Create hidden comment for tests
  async createHiddenComment(params) {
    params = {
      body:        null,
      postId:      null,
      userId:      null,
      oldUsername: null,
      hideType:    Comment.DELETED,
      ...params,
    };

    if (params.postId === null) {
      throw new Error(`Undefined postId of comment`);
    }

    if (params.hideType !== Comment.DELETED && params.hideType !== Comment.HIDDEN_ARCHIVED) {
      throw new Error(`Invalid hideType of comment: ${params.hideType}`);
    }

    if (params.hideType === Comment.HIDDEN_ARCHIVED && !params.userId === null && params.oldUsername === null) {
      throw new Error(`Undefined author of HIDDEN_ARCHIVED comment`);
    }

    if (params.hideType === Comment.HIDDEN_ARCHIVED && params.body === null) {
      throw new Error(`Undefined body of HIDDEN_ARCHIVED comment`);
    }

    const [uid] = (await this.database('comments').returning('uid').insert({
      post_id:   params.postId,
      hide_type: params.hideType,
      body:      Comment.hiddenBody(params.hideType),
    }));

    if (params.hideType === Comment.HIDDEN_ARCHIVED) {
      await this.database('hidden_comments').insert({
        comment_id:   uid,
        body:         params.body,
        user_id:      params.userId,
        old_username: params.oldUsername,
      });
    }

    return uid;
  }
};

export default commentsTrait;

///////////////////////////////////////////////////

export function initCommentObject(attrs) {
  if (!attrs) {
    return null;
  }

  attrs = prepareModelPayload(attrs, COMMENT_FIELDS, COMMENT_FIELDS_MAPPING);
  return initObject(Comment, attrs, attrs.id);
}

const COMMENT_COLUMNS = {
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  body:      'body',
  postId:    'post_id',
  userId:    'user_id',
  hideType:  'hide_type',
}

const COMMENT_COLUMNS_MAPPING = {
  createdAt: (timestamp) => {
    const d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  },
  updatedAt: (timestamp) => {
    const d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  }
}

export const COMMENT_FIELDS = {
  uid:        'id',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
  body:       'body',
  user_id:    'userId',
  post_id:    'postId',
  hide_type:  'hideType',
}

const COMMENT_FIELDS_MAPPING = {
  updated_at: (time) => time.getTime().toString(),
  created_at: (time) => time.getTime().toString(),
  post_id:    (post_id) => post_id ? post_id : null,
  user_id:    (user_id) => user_id ? user_id : null,
}

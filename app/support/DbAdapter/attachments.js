import validator from 'validator'

import { Attachment } from '../../models';

import { initObject, prepareModelPayload } from './utils';

///////////////////////////////////////////////////
// Attachments
///////////////////////////////////////////////////

const attachmentsTrait = (superClass) => class extends superClass {
  async createAttachment(payload) {
    const preparedPayload = prepareModelPayload(payload, ATTACHMENT_COLUMNS, ATTACHMENT_COLUMNS_MAPPING)
    const res = await this.database('attachments').returning('uid').insert(preparedPayload)
    return res[0]
  }

  async getAttachmentById(id) {
    if (!validator.isUUID(id)) {
      return null
    }

    const attrs = await this.database('attachments').first().where('uid', id)
    return initAttachmentObject(attrs);
  }

  async getAttachmentsByIds(ids) {
    const responses = await this.database('attachments').whereIn('uid', ids).orderByRaw(`position(uid::text in '${ids.toString()}')`)
    return responses.map(initAttachmentObject)
  }

  updateAttachment(attachmentId, payload) {
    const preparedPayload = prepareModelPayload(payload, ATTACHMENT_COLUMNS, ATTACHMENT_COLUMNS_MAPPING)

    return this.database('attachments').where('uid', attachmentId).update(preparedPayload)
  }

  async deleteAttachment(id) {
    await this.database.raw(`delete from attachments where uid = ?`, id);
  }

  linkAttachmentToPost(attachmentId, postId, ord = 0) {
    const payload = { post_id: postId, ord }
    return this.database('attachments').where('uid', attachmentId).update(payload)
  }

  unlinkAttachmentFromPost(attachmentId, postId) {
    const payload = { post_id: null }
    return this.database('attachments').where('uid', attachmentId).where('post_id', postId).update(payload)
  }

  async getPostAttachments(postId) {
    const res = await this.database('attachments').select('uid').orderBy('ord', 'asc').orderBy('created_at', 'asc').where('post_id', postId)
    const attrs = res.map((record) => {
      return record.uid
    })
    return attrs
  }

  async getAttachmentsOfPost(postId) {
    const responses = await this.database('attachments').orderBy('ord', 'asc').orderBy('created_at', 'asc').where('post_id', postId)
    return responses.map(initAttachmentObject)
  }
};

export default attachmentsTrait;

///////////////////////////////////////////////////

export function initAttachmentObject(attrs) {
  if (!attrs) {
    return null;
  }

  attrs = prepareModelPayload(attrs, ATTACHMENT_FIELDS, ATTACHMENT_FIELDS_MAPPING);
  return initObject(Attachment, attrs, attrs.id);
}

const ATTACHMENT_COLUMNS = {
  createdAt:     'created_at',
  updatedAt:     'updated_at',
  fileName:      'file_name',
  fileSize:      'file_size',
  mimeType:      'mime_type',
  mediaType:     'media_type',
  fileExtension: 'file_extension',
  noThumbnail:   'no_thumbnail',
  imageSizes:    'image_sizes',
  artist:        'artist',
  title:         'title',
  userId:        'user_id',
  postId:        'post_id'
}

const ATTACHMENT_COLUMNS_MAPPING = {
  createdAt: (timestamp) => {
    const d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  },
  updatedAt: (timestamp) => {
    const d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  },
  noThumbnail: (no_thumbnail) => {return no_thumbnail === '1'},
  fileSize:    (file_size) => {
    return parseInt(file_size, 10)
  },
  postId: (post_id) => {
    if (validator.isUUID(post_id)) {
      return post_id
    }

    return null
  },
  userId: (user_id) => {
    if (validator.isUUID(user_id)) {
      return user_id
    }

    return null
  }
}

export const ATTACHMENT_FIELDS = {
  uid:            'id',
  created_at:     'createdAt',
  updated_at:     'updatedAt',
  file_name:      'fileName',
  file_size:      'fileSize',
  mime_type:      'mimeType',
  media_type:     'mediaType',
  file_extension: 'fileExtension',
  no_thumbnail:   'noThumbnail',
  image_sizes:    'imageSizes',
  artist:         'artist',
  title:          'title',
  user_id:        'userId',
  post_id:        'postId'
}

const ATTACHMENT_FIELDS_MAPPING = {
  created_at:   (time) => { return time.getTime().toString() },
  updated_at:   (time) => { return time.getTime().toString() },
  no_thumbnail: (no_thumbnail) => {return no_thumbnail ? '1' : '0' },
  file_size:    (file_size) => {return file_size && file_size.toString()},
  post_id:      (post_id) => {return post_id ? post_id : ''},
  user_id:      (user_id) => {return user_id ? user_id : ''}
}

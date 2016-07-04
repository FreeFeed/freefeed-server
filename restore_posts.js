import bluebird from 'bluebird'
import knexjs from 'knex'
import { public_posts as mysql_config } from './knexfile'
import { postgres, dbAdapter } from './app/models'

global.Promise = bluebird
global.Promise.onPossiblyUnhandledRejection((e) => { throw e; });

const mysql = knexjs(mysql_config)

const START_DATE = '2016-04-26 00:00:00'

function timestampToDateStr(timestamp){
  let d = new Date()
  d.setTime(timestamp)
  return d.toISOString()
}

async function getPostApiResponse(postUUID){
  const res = await mysql('freefeed_urls').select('body').where('url', '=', `/v1/posts/${postUUID}?maxComments=all`)
  const savedApiResponse = res[0].body
  return JSON.parse(savedApiResponse)
}

async function postExist(postUUID){
  const res = await postgres('posts').where('uid', postUUID)
  let attrs = res[0]

  return !!attrs
}

async function createPost(savedPostData, postJson){
  let post = {
    uid:        savedPostData.uuid,
    body:       savedPostData.body,
    created_at: savedPostData.createdat,
    updated_at: savedPostData.updatedat,
    comments_disabled: postJson.commentsDisabled === '1',
    user_id:           postJson.createdBy
  }

  post.destination_feed_ids = await dbAdapter.getTimelinesIntIdsByUUIDs(postJson.postedTo)
  post.feed_ids = post.destination_feed_ids

  return postgres('posts').insert(post)
}

async function createComment(postUUID, commentJson){
  let comment = {
    uid:        commentJson.id,
    body:       commentJson.body,
    created_at: timestampToDateStr(commentJson.createdAt),
    updated_at: timestampToDateStr(commentJson.updatedAt),
    post_id:    postUUID,
    user_id:    commentJson.createdBy
  }

  return postgres('comments').insert(comment)
}


async function createPostComments(postUUID, payload){
  let commentsDescr = payload.comments
  if (!commentsDescr){
    return
  }

  //console.log(commentsDescr)
  for (let comment of commentsDescr){
    await createComment(postUUID, comment)
  }
}

async function createLike(postUUID, postCreatedAt, userUUID){
  let like = {
    post_id: postUUID,
    user_id: userUUID,
    created_at: postCreatedAt
  }

  return postgres('likes').insert(like)
}


async function createPostLikes(postUUID, payload){
  let likes = payload.posts.likes
  let postCreatedAt = timestampToDateStr(payload.posts.createdAt)
  if (!likes){
    return
  }

  //console.log(likes)
  for (let userUUID of likes){
    await createLike(postUUID, postCreatedAt, userUUID)
  }
}

async function createAttachment(postUUID, attachmentJson){
  const fileName = attachmentJson.fileName
  let fileExt = fileName.substr(fileName.lastIndexOf('.') + 1);
  let attachment = {
    uid:            attachmentJson.id,
    created_at:     timestampToDateStr(attachmentJson.createdAt),
    updated_at:     timestampToDateStr(attachmentJson.updatedAt),
    file_name:      fileName,
    file_size:      attachmentJson.fileSize,
    mime_type:      "",
    media_type:     attachmentJson.mediaType,
    file_extension: fileExt,
    no_thumbnail:   true,
    image_sizes:    attachmentJson.imageSizes,
    artist:         attachmentJson.artist,
    title:          attachmentJson.title,
    user_id:        attachmentJson.createdBy,
    post_id:        postUUID
  }

  return postgres('attachments').insert(attachment)
}


async function createPostAttachments(postUUID, payload){
  let attachmentsDescr = payload.attachments
  if (!attachmentsDescr){
    return
  }

  //console.log(attachmentsDescr)
  for (let attachment of attachmentsDescr){
    await createAttachment(postUUID, attachment)
  }
}


async function processPost(savedPostData, currentPost, postsCount){
  const postUUID = savedPostData.uuid
  try{
    const exist = await postExist(postUUID)
    if(exist){
      return
    }

    console.log(`Processing post (${currentPost} of ${postsCount})`, postUUID)

    const apiPostResponse = await getPostApiResponse(postUUID)

    await createPost(savedPostData, apiPostResponse.posts)

    await createPostComments(postUUID, apiPostResponse)

    await createPostLikes(postUUID, apiPostResponse)

    await createPostAttachments(postUUID, apiPostResponse)

  } catch (e) {
    console.log("-------------------------------------------------------")
    console.log(e)
    console.log("-------------------------------------------------------")
  }
}

async function main(){
  console.log("Started")
  let newPosts = await mysql('freefeed_posts').where('createdat', '>', START_DATE)

  const postsCount = newPosts.length
  let currentPost = 1

  for (let p of newPosts){
    await processPost(p, currentPost, postsCount)
    currentPost += 1
  }
}

//TODO:republish post

main().then(()=> {
  console.log("Finished")
  process.exit(0)
})
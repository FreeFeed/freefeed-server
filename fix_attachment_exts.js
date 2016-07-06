import bluebird from 'bluebird'
import knexjs from 'knex'
import _ from 'lodash'
import { public_posts as mysql_config } from './knexfile'
import { postgres } from './app/models'

global.Promise = bluebird
global.Promise.onPossiblyUnhandledRejection((e) => { throw e; });

const mysql = knexjs(mysql_config)

const START_DATE = '2016-04-26 00:00:00'

async function getPostApiResponse(postUUID){
  const res = await mysql('freefeed_urls').select('body').where('url', '=', `/v1/posts/${postUUID}?maxComments=all`)
  const savedApiResponse = res[0].body
  return JSON.parse(savedApiResponse)
}

async function fixAttachment(postUUID, attachmentJson, authorName){
  const wrongExtensions = ['jpeg', 'JPG', 'PNG', 'GIF']
  const fileName = attachmentJson.fileName || ""
  let wrongFileExt = fileName.substr(fileName.lastIndexOf('.') + 1);
  let newFileExt = attachmentJson.url.substr(attachmentJson.url.lastIndexOf('.') + 1);

  if(!_.includes(wrongExtensions, wrongFileExt)){
    return
  }

  console.log('Fix attachment of post', postUUID, `(${authorName})`)

  const attachment = {
    file_extension: newFileExt
  }

  return postgres('attachments').where('uid', attachmentJson.id).update(attachment)
}


async function fixPostAttachments(postUUID, payload){
  let attachmentsDescr = payload.attachments
  if (!attachmentsDescr){
    return
  }

  const postAuthorId = payload.posts.createdBy
  const author = _.find(payload.users, (u)=>{
    return u.id == postAuthorId
  })
  const authorUsername = author ? author.username : "-"

  for (let attachment of attachmentsDescr){
    await fixAttachment(postUUID, attachment, authorUsername)
  }
}

async function processPost(savedPostData){
  const postUUID = savedPostData.uuid
  try{
    const apiPostResponse = await getPostApiResponse(postUUID)

    if(!apiPostResponse || apiPostResponse.err){
      console.log('No response for post', postUUID)
      return
    }

    await fixPostAttachments(postUUID, apiPostResponse)

  } catch (e) {
    console.log("-------------------------------------------------------")
    console.log(e)
    console.log("-------------------------------------------------------")
  }
}

async function main(){
  console.log("Started")
  let newPosts = await mysql('freefeed_posts').where('createdat', '>', START_DATE)

  for (let p of newPosts){
    await processPost(p)
  }
}

main().then(()=> {
  console.log("Finished")
  process.exit(0)
})
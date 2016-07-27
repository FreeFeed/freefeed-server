import bluebird from 'bluebird'
import _ from 'lodash'
import twitter from 'twitter-text'
import { postgres, dbAdapter } from './app/models'

global.Promise = bluebird
global.Promise.onPossiblyUnhandledRejection((e) => { throw e; });

const POST_CHUNK_SIZE = 100;

async function processPost(post){
  const postUUID = post.uid
    , postBody   = post.body
  try{
    const postTags = _.uniq(twitter.extractHashtags(postBody))

    if (!postTags || postTags.length == 0) {
      return
    }
    console.log(postTags)
    await dbAdapter.linkHashtagsByNames(postTags, postUUID)
  } catch (e) {
    console.log("-------------------------------------------------------")
    console.log(e)
    console.log("-------------------------------------------------------")
  }
}

async function main(){
  console.log("Started")

  let currentOffset = 0
  let finished = false

  while (!finished) {
    const chunk = await postgres('posts').select('uid', 'body').orderBy('created_at', 'desc').offset(currentOffset).limit(POST_CHUNK_SIZE)
    if (chunk.length < POST_CHUNK_SIZE) {
      finished = true
    }
    currentOffset += POST_CHUNK_SIZE

    const promises = chunk.map((post) => processPost(post))
    await Promise.all(promises)
  }
}

main().then(()=> {
  console.log("Finished")
  process.exit(0)
})
/*global $database */
import fetch from 'node-fetch'
import request  from 'superagent'
import _  from 'lodash'

import { getSingleton as initApp } from '../../app/app'


const apiUrl = async (relativeUrl) => {
  const app = await initApp()
  return `${app.config.host}${relativeUrl}`
}

export function flushDb() {
  return () => $database.flushdbAsync()
}

export function createUser(username, password, attributes, callback) {
  return function(done) {
    if (typeof attributes === 'function') {
      callback = attributes
      attributes = {}
    }

    if (typeof attributes === 'undefined')
      attributes = {}

    var user = {
      username: username,
      password: password
    }
    if (attributes.email)
      user.email = attributes.email

    apiUrl('/v1/users').then(url => {
      request
        .post(url)
        .send(user)
        .end(function(err, res) {
          if (callback) {
            var luna = res.body.users
            luna.password = user.password
            callback(res.body.authToken, luna)
          }
          done()
        })
    })
  }
}

export function createUserCtx(context, username, password, attrs) {
  return exports.createUser(username, password, attrs, function(token, user) {
    context.user      = user
    context.authToken = token
    context.username  = username.toLowerCase()
    context.password  = password
    context.attributes = attrs
  })
}

export function subscribeToCtx(context, username) {
  return function(done) {
    apiUrl(`/v1/users/${username}/subscribe`).then(url => {
      request
        .post(url)
        .send({ authToken: context.authToken })
        .end(function(err, res) {
          done(err, res)
        })
    })
  }
}

export function updateUserCtx(context, attrs) {
  return function(done) {
    apiUrl(`/v1/users/${context.user.id}`).then(url => {
      request
        .post(url)
        .send({ authToken: context.authToken,
          user: { email: attrs.email },
          '_method': 'put' })
        .end(function(err, res) {
          done(err, res)
        })
    })
  }
}

export function resetPassword(token) {
  return function(done) {
    apiUrl(`/v1/passwords/${token}`).then(url => {
      request
        .post(url)
        .send({ '_method': 'put' })
        .end(function(err, res) {
          done(err, res)
        })
    })
  }
}

export function createPost(context, body, callback) {
  return function(done) {
    apiUrl('/v1/posts').then(url => {
      request
        .post(url)
        .send({ post: { body: body }, meta: { feeds: context.username }, authToken: context.authToken })
        .end(function(err, res) {
          context.post = res.body.posts
          if (typeof callback !== 'undefined')
            callback(context.post)

          done(err, res)
        })
    })
  }
}

export function createPostForTest(context, body, callback) {
  apiUrl('/v1/posts').then(url => {
    request
      .post(url)
      .send({ post: { body: body }, meta: { feeds: context.username }, authToken: context.authToken })
      .end(function(err, res) {
        context.post = res.body.posts
        callback(err, res)
      })
  })
}

export function createComment(body, postId, authToken, callback) {
  return function(done) {
    apiUrl('/v1/comments').then(url => {
      var comment = {
        body: body,
        postId: postId
      }

      request
        .post(url)
        .send({ comment: comment, authToken: authToken })
        .end(function(err, res) {
          done(err, res)
        })
    })
  }(callback)
}

export function createCommentCtx(context, body) {
  return function(done) {
    apiUrl('/v1/comments').then(url => {
      var comment = {
        body: body,
        postId: context.post.id
      }

      request
        .post(url)
        .send({comment: comment, authToken: context.authToken})
        .end(function (err, res) {
          context.comment = res.body.comments
          done(err, res)
        })
    })
  }
}

export function removeComment(commentId, authToken, callback) {
  return function(done) {
    apiUrl(`/v1/comments/${commentId}`).then(url => {
      request
        .post(url)
        .send({
          authToken: authToken,
          '_method': 'delete'
        })
        .end(function(err, res) {
          done(err, res)
        })
    })
  }(callback)
}

export function getTimeline(timelinePath, authToken, callback) {
  return function(done) {
    apiUrl(timelinePath).then(url => {
      var sendParams = {};

      if (authToken) {
        sendParams.authToken = authToken
      }

      request
        .get(url)
        .query(sendParams)
        .end(function(err, res) {
          done(err, res)
        })
    })
  }(callback)
}

export function getTimelinePaged(timelinePath, authToken, offset, limit, callback) {
  return function(done) {
    apiUrl(timelinePath).then(url => {
      var sendParams = {};

      if (!_.isUndefined(authToken)) {
        sendParams.authToken = authToken
      }

      if (!_.isUndefined(offset)) {
        sendParams.offset = offset
      }

      if (!_.isUndefined(limit)) {
        sendParams.limit = limit
      }

      request
        .get(url)
        .query(sendParams)
        .end(function(err, res) {
          done(err, res)
        })
    })
  }(callback)
}

export function getSubscribers(username, authToken, callback) {
  return function(done) {
    let sendParams = {};
    if (authToken) {
      sendParams.authToken = authToken
    }

    apiUrl(`/v1/users/${username}/subscribers`).then(url => {
      request
        .get(url)
        .query(sendParams)
        .end(function(err, res) {
          done(err, res)
        })
    })
  }(callback)
}

export function getSubscriptions(username, authToken, callback) {
  return function(done) {
    let sendParams = {};
    if (authToken) {
      sendParams.authToken = authToken
    }

    apiUrl(`/v1/users/${username}/subscriptions`).then(url => {
      request
        .get(url)
        .query(sendParams)
        .end(function(err, res) {
          done(err, res)
        })
    })
  }(callback)
}

async function postJson(relativeUrl, data) {
  return fetch(
    await apiUrl(relativeUrl),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    }
  )
}

export async function createUserAsync(username, password, attributes) {
  if (typeof attributes === 'undefined'){
    attributes = {}
  }

  let user = {
    username,
    password
  }

  if (attributes.email) {
    user.email = attributes.email
  }

  let response = await postJson(`/v1/users`, user)
  let data = await response.json()

  let userData = data.users
  userData.password = password

  return {
    authToken: data.authToken,
    user: userData,
    username: username.toLowerCase(),
    password,
    attributes
  }
}

export function like(postId, authToken) {
  return postJson(`/v1/posts/${postId}/like`, { authToken })
}

export function updateUserAsync(userContext, user) {
  return postJson(
    `/v1/users/${userContext.user.id}`,
    {
      authToken: userContext.authToken,
      user,
      '_method': 'put'
    }
  )
}

export function goPrivate(userContext) {
  return updateUserAsync(userContext, { isPrivate: "1" });
}

export function goPublic(userContext) {
  return updateUserAsync(userContext, { isPrivate: "0" });
}

export function subscribeToAsync(subscriber, victim) {
  return postJson(`/v1/users/${victim.username}/subscribe`, {authToken: subscriber.authToken})
}

export async function mutualSubscriptions(userContexts) {
  let promises = []

  for (let ctx1 of userContexts) {
    for (let ctx2 of userContexts) {
      if (ctx1.username == ctx2.username) {
        continue
      }

      promises.push(exports.subscribeToAsync(ctx1, ctx2))
    }
  }

  await Promise.all(promises)
}

export async function createAndReturnPost(userContext, body) {
  let response = await postJson(
    '/v1/posts',
    {
      post: {body},
      meta: {feeds: userContext.username},
      authToken: userContext.authToken
    }
  )

  let data = await response.json()

  return data.posts
}

export function createCommentAsync (userContext, postId, body) {
  return postJson('/v1/comments', {comment: {body, postId}, authToken: userContext.authToken})
}

const getTimelineAsync = async (relativeUrl, userContext) => {
  let url = await apiUrl(relativeUrl)

  if (!_.isUndefined(userContext)) {
    let encodedToken = encodeURIComponent(userContext.authToken)
    url = `${url}?authToken=${encodedToken}`
  }

  let response = await fetch(url)
  let data = await response.json()

  return data
}

export function getRiverOfNews(userContext) {
  return getTimelineAsync('/v1/timelines/home', userContext)
}

export function getMyDiscussions(userContext) {
  return getTimelineAsync('/v1/timelines/filter/discussions', userContext)
}

export function sendResetPassword(email) {
  return postJson('/v1/passwords', { email })
}

export async function readPostAsync(postId, userContext) {
  let relativeUrl = `/v1/posts/${postId}?maxComments=all`
  let url = await apiUrl(relativeUrl)

  if (!_.isUndefined(userContext)) {
    let encodedToken = encodeURIComponent(userContext.authToken)
    url = `${url}&authToken=${encodedToken}`
  }

  return fetch(url)
}

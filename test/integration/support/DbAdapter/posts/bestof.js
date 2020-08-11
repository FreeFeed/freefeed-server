/* eslint-env node, mocha */
/* global $pg_database */
import _ from 'lodash'

import cleanDB from '../../../../dbCleaner'
import { dbAdapter, User } from '../../../../../app/models'
import { GONE_SUSPENDED } from '../../../../../app/models/user'


describe('BestOf', () => {
  beforeEach(() => cleanDB($pg_database))

  describe('best of', () => {
    let users, popularPost, unpopularPost, bestPosts;

    beforeEach(async () => {
      // eleven users from 0 to 10
      users = await Promise.all(_.range(11).map((i) => {
        const user = new User({
          username: `user${i}`,
          password: 'password'
        })
        return user.create()
      }))

      await users[0].update({ isProtected: '1' })

      popularPost = await users[0].newPost({ body: 'Popular post' })
      await popularPost.create()

      unpopularPost = await users[0].newPost({ body: 'Unpopular post' })
      await unpopularPost.create()

      // 15 comments by 5 authors, each posts 3
      await Promise.all(_.range(15).map((i) => {
        const userId = (i % 5) + 1;  // users 1, 2, 3, 4, 5
        const comment = users[userId].newComment({ body: 'comment', postId: popularPost.id })
        return comment.create()
      }))

      // 10 likes from 10 users
      await Promise.all(_.range(1, 11).map((i) => {
        return popularPost.addLike(users[i])
      }))
    })

    it('should only show the popular post', async () => {
      bestPosts = await dbAdapter.bestPostsIds(users[0])

      bestPosts.should.not.be.empty
      bestPosts.length.should.eql(1)
      bestPosts[0].should.eql(popularPost.id)
    })

    it('should not show the popular post to an anonymous', async () => {
      bestPosts = await dbAdapter.bestPostsIds()

      bestPosts.should.be.empty
      bestPosts.length.should.eql(0)
    })

    describe(`popular post's author is gone`, () => {
      beforeEach(() => users[0].setGoneStatus(GONE_SUSPENDED));

      it('should not show the popular post', async () => {
        bestPosts = await dbAdapter.bestPostsIds(users[1])
        bestPosts.should.be.empty
      })
    });

    describe(`one of popular post's likers is gone`, () => {
      beforeEach(() => users[1].setGoneStatus(GONE_SUSPENDED));

      it('should not show the popular post', async () => {
        bestPosts = await dbAdapter.bestPostsIds(users[2])
        bestPosts.should.be.empty
      })
    });
  })
})

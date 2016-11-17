FreeFeed Server
===============

FreeFeed is a social network that enables you to discover and discuss the interesting
stuff your friends find on the web.

FreeFeed is being built as a replacement for FriendFeed, the real-time aggregator and social network
where "likes" for user generated content were implemented for the first time.

FreeFeed is based on [Pepyatka](https://github.com/pepyatka/pepyatka-server/) project

Setting out FreeFeed on OSX
---------------------------

1. brew install redis
1. brew install graphicsmagick --with-jasper --with-little-cms2 --with-webp
1. brew install nvm
1. nvm install
1. npm install

Setting out database on OSX
---------------------------
1. brew install postgres
1. postgres.server start
1. createuser -P -s freefeed (enter freefeed as password)
1. createdb -O freefeed freefeed
1. cp knexfile.js{.dist,}
1. ./node_modules/.bin/knex migrate:latest

Starting up FreeFeed
-------------------
1. mkdir ./public/files/attachments/thumbnails/ && mkdir ./public/files/attachments/thumbnails2/
1. redis-server /usr/local/etc/redis.conf
1. npm start

Testing
-------------------
1. /usr/local/Cellar/postgresql/{VERSION}/bin/createuser -s postgres
1. createdb -O freefeed freefeed_test
1. npm test

Contribute
----------

1. [How to contribute](https://freefeed.net/dev)

Questions or need help?
-----------------------

You can drop your question [here](https://freefeed.net/support).

Copyright and license
---------------------

FreeFeed is licensed under the MIT License.

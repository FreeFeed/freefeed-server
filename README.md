[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2FFreeFeed%2Ffreefeed-server.svg?type=shield)](https://app.fossa.io/projects/git%2Bgithub.com%2FFreeFeed%2Ffreefeed-server?ref=badge_shield)

# FreeFeed Server

FreeFeed is a social network that enables you to discover and discuss the interesting
stuff your friends find on the web.

FreeFeed is being built as a replacement for FriendFeed, the real-time aggregator and social network
where "likes" for user generated content were implemented for the first time.

FreeFeed is based on [Pepyatka](https://github.com/pepyatka/pepyatka-server/) project

## Getting started with FreeFeed on OSX

### Dependencies via Homebrew

```
brew install redis
redis-server /usr/local/etc/redis.conf
brew install graphicsmagick --with-jasper --with-little-cms2 --with-webp
brew install postgres
postgres.server start
createuser -P -s freefeed (enter freefeed as password)
createdb -O freefeed freefeed
```

### Dependencies via Docker

1. [Install Docker](https://www.docker.com/get-started)
1. [Install docker-compose](https://docs.docker.com/compose/install/)
1. docker-compose up -d

### NodeJS environment and the app

```
brew install nvm
nvm install
yarn install
yarn knex migrate:latest
mkdir ./public/files/attachments/thumbnails/ && mkdir ./public/files/attachments/thumbnails2/
yarn start
```

### Custom configuration

If you have other PostgreSQL (or any other) settings than default, you shold configure FreeFeed server in a proper way.

The FreeFeed server uses [node-config](https://github.com/lorenwest/node-config) for configuration. You can create your own local configuration file to override any of default values. See the [Configuration Files](https://github.com/lorenwest/node-config/wiki/Configuration-Files) page of node-config documentation for details.

The default configuration is defined in `config/default.js` file. The `config/test.js` and `config/default-travis.json` files can be used as an example of customized configurations (for the 'test' and Travis CI environments accordingly).

## Testing

```
createdb -O freefeed freefeed_test
yarn test
```

## Testing docker image

```
make image
docker compose up -d
make docker-run
```

## Pushing docker image

[Get personal access token](https://github.com/settings/tokens) with `write:packages` and `read:packages` scopes.

```
docker login docker.pkg.github.com -u USERNAME -p TOKEN
make push
```

## Contribute

1. [How to contribute](https://freefeed.net/dev)

## Questions or need help?

You can drop your question [here](https://freefeed.net/support).

## Copyright and license

FreeFeed is licensed under the MIT License.

## License
[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2FFreeFeed%2Ffreefeed-server.svg?type=large)](https://app.fossa.io/projects/git%2Bgithub.com%2FFreeFeed%2Ffreefeed-server?ref=badge_large)

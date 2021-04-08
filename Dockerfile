FROM node:14-buster

RUN apt-get update && \
    apt-get install -y \
    graphicsmagick \
    g++ \
    git \
    make

ADD . /server
WORKDIR /server

RUN rm -rf node_modules && \
    rm -f log/*.log && \
    mkdir -p ./public/files/attachments/thumbnails && \
    mkdir -p ./public/files/attachments/thumbnails2 && \
    yarn install

ENV NODE_ENV production

CMD ["yarn","start"]
FROM node:8

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
    yarn install
RUN mkdir -p ./public/files/attachments/thumbnails && \
    mkdir -p ./public/files/attachments/thumbnails2

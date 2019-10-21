VERSION = $(shell git describe --tags)
IMAGE = docker.pkg.github.com/freefeed/freefeed-server/app:$(VERSION)

all: init

image:
	@docker build -t $(IMAGE) .

docker-run:
	@docker run --name frf-server -t --rm -p 3000:3000 --net freefeed-server_default \
		-e "REDIS_HOST=redis" -v ${CURDIR}/knexfile.js.docker:/server/knexfile.js $(IMAGE) npm start

push: image
	@docker push $(IMAGE)

clean:
	docker rmi $(IMAGE)
	rm -rf node_modules

.PHONY: all image docker-run push clean

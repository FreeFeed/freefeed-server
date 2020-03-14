VERSION = $(shell git describe --tags)
IMAGE = freefeed/freefeed-server

all: init

image:
	@docker build -t $(IMAGE):$(VERSION) .

latest: image
	@docker tag $(IMAGE):$(VERSION) $(IMAGE):latest

push:
	@docker push $(IMAGE):$(VERSION)

push-latest: latest
	@docker push $(IMAGE):latest

clean:
	docker rmi $(IMAGE):$(VERSION)
	docker rmi $(IMAGE):latest
	rm -rf node_modules

.PHONY: all image latest push push-latest clean

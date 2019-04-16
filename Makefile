IMAGE = freefeed/server:dev

all: init

init:
	@sed 's/localhost/db/g' knexfile.js.dist > knexfile.js
	@mkdir -p public/files/attachments/thumbnails
	@mkdir -p public/files/attachments/thumbnails2
	@docker build -t $(IMAGE) .
	@docker run -it --rm -v $(shell pwd):/server -w /server $(IMAGE) npm install

docker-shell:
	@docker run -it --rm -v $(shell pwd):/server -w /server $(IMAGE) bash

clean:
	docker rmi $(IMAGE)
	rm -rf node_modules

.PHONY: all init docker-shell clean

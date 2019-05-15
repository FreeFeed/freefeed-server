base_image = freefeed/base:latest

all: init

init:
	@sed 's/localhost/db/g' knexfile.js.dist > knexfile.js
	@mkdir -p public/files/attachments/thumbnails
	@mkdir -p public/files/attachments/thumbnails2
	@docker run -it --rm -v $(shell pwd):/server -w /server $(base_image) yarn install

docker-shell:
	@docker run -it --rm -v $(shell pwd):/server -w /server $(base_image) bash

clean:
	rm -rf node_modules

.PHONY: all init docker-shell clean

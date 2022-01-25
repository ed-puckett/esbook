.PHONY: all
all: start


######################################################################

SHELL = /bin/bash
MAKEFLAGS += --no-print-directory

BUILDDIR = ./build


######################################################################
# build rules

.DEFAULT: all

.PHONY: clean
clean:
	@-rm -fr $(BUILDDIR) >/dev/null 2>&1 || true

.PHONY: full-clean
full-clean: clean
	@-rm -fr ./node_modules >/dev/null 2>&1 || true

./node_modules: ./package.json
	npm install

.PHONY: build
build: ./node_modules
	@( \
	    $(foreach d,$(wildcard ./src/*/Makefile ./src/facet/*/Makefile),( echo make $(dir $d) && cd "$(dir $d)" && make ) && ) \
	    true \
	)

.PHONY: lint
lint: ./node_modules
	./node_modules/.bin/eslint src

.PHONY: server
server: build
	npx httpserver -d -n --host 127.0.0.1 --port 4300

.PHONY: dev-server
dev-server:
	npx nodemon -w src -e js,mjs,html,css,ico,svg -x "bash -c 'make server' || exit 1"

.PHONY: start
start: build
	chromium http://127.0.0.1:4300/src/index.html

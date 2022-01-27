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
	npm install && \
	( if [[ ! -e "./node_modules/@yaffle/expression/node_modules" ]]; then cd ./node_modules/@yaffle/expression/ && ln -s ../../../node_modules .; fi )

$(BUILDDIR):
	mkdir -p "$(BUILDDIR)" && \
	if [[ ! -e "$(BUILDDIR)/src" ]]; then ( cd "$(BUILDDIR)" && ln -s ../src . ); fi && \
	if [[ ! -e "$(BUILDDIR)/node_modules" ]]; then ( cd "$(BUILDDIR)" && ln -s ../node_modules . ); fi

.PHONY: build-dir
build-dir: ./node_modules $(BUILDDIR)

.PHONY: lint
lint: ./node_modules
	./node_modules/.bin/eslint src

.PHONY: server
server: build-dir
	( cd "$(BUILDDIR)" && npx http-server -d -n -c-1 --host 127.0.0.1 --port 4300 )

.PHONY: dev-server
dev-server:
	npx nodemon -w src -e js,mjs,html,css,ico,svg -x "bash -c 'make server' || exit 1"

.PHONY: start
start: build-dir
	chromium http://127.0.0.1:4300/src/index.html

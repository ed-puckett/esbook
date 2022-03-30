.PHONY: all
all: start


######################################################################

SHELL = /bin/bash
MAKEFLAGS += --no-print-directory

BUILDDIR = ./build

SERVER_PORT = 4300


######################################################################
# build rules

.DEFAULT: all

.PHONY: clean
clean: kill-server
	@-rm -fr "$(BUILDDIR)" >/dev/null 2>&1 || true

.PHONY: full-clean
full-clean: clean
	@-rm -fr ./node_modules >/dev/null 2>&1 || true

./node_modules: ./package.json
	npm install

.PHONY: build-dir
build-dir: ./node_modules README.md
	mkdir -p "$(BUILDDIR)" && \
	if [[ ! -e "$(BUILDDIR)/src" ]]; then ( cd "$(BUILDDIR)" && ln -s ../src . ); fi && \
	if [[ ! -e "$(BUILDDIR)/lib" ]]; then ( cd "$(BUILDDIR)" && ln -s ../lib . ); fi && \
	rm -fr "$(BUILDDIR)/node_modules" && \
	mkdir -p "$(BUILDDIR)/node_modules" && \
	for d in chart.js codemirror d3 dagre-d3 dialog-polyfill dompurify js-sha256 marked mathjax nerdamer plotly.js-dist sprintf-js uuid; do cp -a "./node_modules/$${d}" "$(BUILDDIR)/node_modules/"; done && \
	/usr/bin/env node -e 'require("fs/promises").readFile("README.md").then(t => console.log(`<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n</head>\n<body>\n$${require("marked").marked(t.toString())}\n</body>\n</html>`))' > "$(BUILDDIR)/help.html"
	cp src/favicon.ico "$(BUILDDIR)/"

.PHONY: demos-dir
demos-dir:
	rm -fr ./demos && \
	( cd ./examples/ && find . -type d -exec mkdir -p ../demos/{} \; ) && \
	( cd ./examples/ && find . -iname '*.esbook' -exec /usr/bin/env node ../build-util/make-demo.mjs {} \; ) && \
	( cd ./demos/ && find . -iname '*.html' | /usr/bin/env node ../build-util/make-demos-index.mjs \; )

.PHONY: lint
lint: ./node_modules
	./node_modules/.bin/eslint src

# kill the server by performing a GET on /QUIT
# uses Linux commands: lsof, grep, cut
.PHONY: server
server: build-dir demos-dir
	( cd "$(BUILDDIR)" && npx http-server -d -n -c-1 -a 127.0.0.1 --port $(SERVER_PORT) | tee >(grep -q -m1 '"GET /QUIT"'; echo QUITTING; kill $$(lsof -itcp:$(SERVER_PORT) -Fp | grep ^p | cut -c2-)) )

# uses curl
.PHONY: kill-server
kill-server:
	@if lsof -itcp:$(SERVER_PORT); then curl http://127.0.0.1:$(SERVER_PORT)/QUIT; fi

.PHONY: dev-server
dev-server:
	npx nodemon -w src -e js,mjs,html,css,ico,svg -x "bash -c 'make server' || exit 1"

.PHONY: client
client:
	chromium --new-window http://127.0.0.1:$(SERVER_PORT)/src/index.html

.PHONY: start
start: build-dir demos-dir
	if ! lsof -itcp:$(SERVER_PORT); then make server <&- >/dev/null 2>&1 & sleep 1; fi; make client

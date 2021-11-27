.PHONY: all
all: build


######################################################################

BUILDDIR = ../build

MODULE = esbook


######################################################################
# build rules

.DEFAULT: all

$(BUILDDIR)/$(MODULE).js: ./*
	@( mkdir -p "$(BUILDDIR)" && NODE_ENV=production npx webpack --config ./webpack-config.js && touch "$@" )

.PHONY: build
build: $(BUILDDIR)/$(MODULE).js

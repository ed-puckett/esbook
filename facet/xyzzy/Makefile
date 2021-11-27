BUILDDIR = ../../build/facet

$(BUILDDIR)/xyzzy.js: ./*
	@( mkdir -p "$(BUILDDIR)" && NODE_ENV=production npx webpack --config ./webpack-config.js && touch "$@" )

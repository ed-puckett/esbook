BUILDDIR = ../../build

$(BUILDDIR)/core-package-bundle.js: ./*
	@( mkdir -p "$(BUILDDIR)" && NODE_ENV=production npx webpack --config ./webpack-config.js && touch "$@" )

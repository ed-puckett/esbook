'use strict';

// This code is not a facet.  It is part of the facet bootstrap process.

const facet_paths = [
    'facet/settings.js',
    'facet/theme-settings.js',
    'facet/message-controller.js',
    'facet/fs-interface.js',
    //...
];

Promise.all(facet_paths.map(p => facet(p)))
    .then(results => Object.fromEntries(results.map((r, i) => [facet_paths[i], r])))
    .then(result_mappings => {
        globalThis.load_core_facets_result = result_mappings;
    })
    .catch(err => {
        globalThis.load_core_facets_result = err;
    });

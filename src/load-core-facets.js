'use strict';

(() => {

    // This code is not a facet.  It is part of the facet bootstrap process.

    globalThis.core = globalThis.core ?? {};

    const facet_paths = [
        'facet/notebook.js',
        //...
    ];

    Promise.all(facet_paths.map(p => globalThis.core.facet(new URL(p, document.currentScript.src))))
        .then(results => Object.fromEntries(results.map((r, i) => [facet_paths[i], r])))
        .then(result_mappings => {
            globalThis.core.load_core_facets_result = result_mappings;
        })
        .catch(err => {
            globalThis.core.load_core_facets_result = err;
        });

})();

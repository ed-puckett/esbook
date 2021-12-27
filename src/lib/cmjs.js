'use strict';

(async ({ current_script, facet, facet_export, facet_load_error }) => { try {  // facet begin

    const tree_data          = await facet('lib/cmjs/tree-data.js');
    const tree               = await facet('lib/cmjs/tree.js');
    const k_means_partition  = await facet('lib/cmjs/k-means-partition.js');
    const cellular_automaton = await facet('lib/cmjs/cellular-automaton.js');


    // === EXPORT ===

    facet_export({
        tree_data,
        tree,
        k_means_partition,
        cellular_automaton,
    });

} catch (err) { facet_load_error(err, current_script); } })(globalThis.core.facet_init());  // facet end

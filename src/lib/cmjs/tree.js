// === CONSTANTS ===

export const max_by_depth_row_node_count = 2**26;
export const max_format_overall_width    = 10000;

const {
    number_comparator,
    get_stats,
} = await import('./tree-data.js');


// === TOP-LEVEL SUPPORT FUNCTIONS ===

export function make_tree_node(s=null, additional_properties) {
    return {
        ...(additional_properties || {}),
        branch: {},
        s,
    };
}

export function is_leaf_node(node) {
    return (Object.keys(node.branch).length === 0);
}

export function clone_tree(n) {
    // node objects have no circular references, so this will work...
    try {
        return JSON.parse(JSON.stringify(n));
    } catch (err) {
        throw new Error('failed to clone tree (possibly too large)');
    }
}

// May throw an error.
// options: {
//     before?:           ({ node, s, depth, parent, sn }) => (),
//     after?:            ({ node, s, depth, parent, sn }) => (),
//     alphabet?:         (String|Symbol|Number)[],
//     max_depth?:        number,
//     exclude_interior?: boolean,  // only nodes with children
//     exclude_shallow?:  boolean,  // only nodes at depth = (options.max_depth ?? get_tree_depth(root))
//     abortable?:        boolean,  // if true, returning non-falsey value from a callback will terminate the walk and return that value
//     include_path?:     boolean,  // if true, also pass "path", an array of symbols, to before/after.
// }
// Note: alphabet, if specified, is the alphabet to be used when traversing
// child nodes.  If not given, then get_tree_alphabet(root) will be used.
// This is the basis for forming the sn (serial number) parameter to the
// before/after callback functions.  For each node, sn is the 0-based visit
// number of an in-order, depth-first traversal of a full tree (if the tree
// is not full, missing nodes' sn values will be skipped).  The sn value is
// consistent from tree-to-tree with the same alphabet size.
// Note: max_depth is taken with respect to the depth from root, not from
// node.depth (which will be different if root is an interior node of a
// larger tree).
export function walk_tree(root, options) {
    options = options ?? {};
    if ( !['undefined', 'function'].includes(typeof options.before ?? undefined) ||
         !['undefined', 'function'].includes(typeof options.after  ?? undefined)    ) {
        throw new Error(`must be a function, undefined or null: options.before, options.after`);
    }
    if (!['undefined', 'number'].includes(typeof options.max_depth)) {
        throw new Error(`must be a number or undefined: options.max_depth`);
    }
    if (!options.before && !options.after) {
        // nothing to do...
        return;
    }
    const alphabet = options.alphabet ?? get_tree_alphabet(root);
    const alen = alphabet.length;
    if (!Array.isArray(alphabet)) {
        throw new Error('options.alphabet must be an array');
    }
    const max_depth = (options.max_depth === null || typeof options.max_depth === 'undefined')
          ? options.exclude_shallow ? get_tree_depth(root) : undefined
          : Math.trunc(options.max_depth);
    if (typeof max_depth !== 'undefined' && max_depth < 0) {
        // nothing to do...
        return;
    }
    function walk(n, s, path, d=0, p, breadth=1, idx=0) {
        // The breadth and idx parameters are used to create the sn (serial number)
        // for each node.  For each depth d (0 being the root), breadth is
        // alphabet.length**d, and idx is the (zero-based) breadth-wise index
        // across siblings at the same depth (with missing nodes' idx values
        // skipped).  Thus, idx ranges from 0 to (alphabet.length**d - 1) at
        // each depth d.
        // The serial number is formed using the count of all nodes at depths < d
        // (in a full tree);  sn = count_of_lower_depth_nodes + idx.  Because
        // the number of nodes in a full tree forms a geometric series of radix
        // alphabet.length starting at 1, count_of_lower_depth_nodes (coldn)
        // is simply (breadth - 1)/(alphabet.length - 1) because breadth is
        // alphabet.length**d.  This only works for alphabet.length > 1.  For
        // alphabet.length === 1, coldn === d.  For alphabet.length === 0, coldn === 0
        // (and, in the case coldn === 0, d should never exceed 0 because there is
        // no alphabet for  branching).
        if (n) {
            if (options.include_path) {
                path = path ?? [];
            }
            if (typeof max_depth !== 'undefined' && d > max_depth) return;
            const excluded = (
                (options.exclude_interior && !is_leaf_node(n)) ||
                (options.exclude_shallow  && d < max_depth)
            );
            const sn = (alen < 1) ? 0 : (alen === 1) ? d : (breadth - 1)/(alen - 1) + idx;
            if (!excluded && options.before) {
                const retval = options.before({ node: n, s, path, depth: d, parent: p, sn });
                if (options.abortable && retval) {
                    return retval;
                }
            }
            for (let i = 0; i < alen; i++) {
                const cs       = alphabet[i];
                const cn       = n.branch[cs];
                const cpath    = options.include_path ? [ ...path, cs ] : undefined;
                const cd       = d+1;
                const cparent  = n;
                const cbreadth = alen*breadth;
                const cidx     = alen*idx + i;
                const retval = walk(cn, cs, cpath, cd, cparent, cbreadth, cidx);  // recursive call
                if (options.abortable && retval) {
                    return retval;
                }
            }
            if (!excluded && options.after) {
                const retval = options.after({ node: n, s, path, depth: d, parent: p, sn });
                if (options.abortable && retval) {
                    return retval;
                }
            }
        }
        return undefined;  // not aborted
    }
    return walk(root);
}

export function tree_child0_sn(parent_sn, alphabet_size) {
    // Derivation: For b = alphabet_size:
    // 1. On each level d (d >= 0), the first sn = (b^d - 1)/(b - 1)
    // 2. For parent_sn on level d, the across-row index of idx = parent_sn - (b^d - 1)/(b - 1)
    // 3. For parent_sn on level d, the across-row index of parent_sn's 0-th child on level d+1 is:
    //    child0_idx = b*idx
    //               - b*(parent_sn - (b^d - 1)/(b - 1))
    //               = b*parent_sn - b*(b^d - 1)/(b - 1)
    //               = b*parent_sn - (b^(d+1) - b)/(b - 1)
    // 4. For parent_sn on level d:
    //    child0_sn = child0_idx + (b^(d+1) - 1)/(b - 1)
    //              = b*parent_sn - (b^(d+1) - b)/(b - 1) + (b^(d+1) - 1)/(b - 1)
    //              = b*parent_sn + (-b^(d+1) + b)/(b - 1) + (b^(d+1) - 1)/(b - 1)
    //              = b*parent_sn + (-b^(d+1) + b + b^(d+1) - 1)/(b - 1)
    //              = b*parent_sn + (b - 1)/(b - 1)
    //              = b*parent_sn + 1
    return parent_sn*alphabet_size + 1;
}

export function tree_parent_sn(child_sn, alphabet_size) {
    // Derivation: follows from derivation for tree_child0_sn.
    return (child_sn <= 0) ? undefined : Math.trunc((child_sn - 1)/alphabet_size);
}

export function get_tree_depth(root) {
    let depth = 0;
    walk_tree(root, {
        before: ({ depth: d }) => {
            depth = Math.max(depth, d);
        },
    });
    return depth;
}

export function get_tree_alphabet(root) {
    const acc = {};
    function scan(n, s=null) {
        if (n) {
            if (s !== null && typeof s !== 'undefined') {
                acc[s] = true;
            }
            for (let cs in n.branch) {
                scan(n.branch[cs], cs);
            }
        }
    }
    scan(root);
    return Object.keys(acc).sort();
}

// May throw an error.
// Return a breadth-first organization of nodes up to the given depth.
// If depth is not given, it is calculated by scanning root.
// The returned nodes are copies.
// Empty paths have node values of undefined.
// If alphabet is null or undefined, then get_tree_alphabet(root) will
// be called to get the current alphabet.  Otherwise, if specified,
// alphabet must be an array whose elements specify the symbols
// to use for the result.
// The result is an array with indices from the range D=[0, alphabet.size].
// For d in D, each value result[d] () is an array with indices from the
// range [0, alphabet.length**d), with the associated value being the
// corresponding node (or undefined).  The alphabet determines the ordering
// of the nodes in each row.  (The result is like a "Heap" data structure.)
export function tree_by_depth(root, depth, alphabet) {
    depth = depth ?? get_tree_depth(root);
    if (typeof depth !== 'number') {
        throw new Error('depth must be a number');
    }
    alphabet = alphabet ?? get_tree_alphabet(root);
    if (!Array.isArray(alphabet)) {
        throw new Error('alphabet must be an array');
    }
    const node_rows = [];
    for (let d = 0; d <= depth; d++) {
        const row = [];
        node_rows.push(row);
        const row_node_count = alphabet.length**d;  // note: 0**0 === 1, but 0**positive === 0
        if (row_node_count > max_by_depth_row_node_count) {
            throw new Error(`row node count ${row_node_count} exceeds maximum ${max_by_depth_row_node_count}`);
        }
        for (let i = 0; i < row_node_count; i++) {
            row.push(undefined);
        }
    }
    function gather_nodes(n, s, parent_index=0) {
        if (n) {
            let index = alphabet.length*parent_index;
            node_rows[n.depth][parent_index] = n;
            for (const s of alphabet) {
                gather_nodes(n.branch[s], s, index);
                index++;
            }
        }
    }
    const root_clone = clone_tree(root);
    gather_nodes(root_clone);  // populate node_rows from tree clone
    return node_rows;
}

// May throw an error
// If depth is not given, it is calculated by scanning root.
// value_getter can be undefined or null, or else a string, symbol, number.
// or a function.  If undefined, then no values will be printed for each
// node, just the associated symbol.  Otherwise, if value_getter is not a
// function, then it names a property of a node to be used as the value to
// be displayed.  Otherwise, if value_getter is a function, it must take a
// node as its single argument and return the value to be displayed.
export function format_tree(root, value_getter, depth) {
    const connector_fill      = '-';
    const connector_node_fill = '+';
    const connector_root_fill = '*';
    if (typeof value_getter !== 'undefined' && value_getter !== null) {
        if (['string', 'symbol', 'number'].includes(typeof value_getter)) {
            const property = value_getter;
            // make value_getter consistently be a function
            value_getter = (node) => node[property];
        } else if (typeof value_getter !== 'function') {
            throw new Error('value_getter must be undefined or null, or else a string, symbol, number or function');
        }
    }
    // value_getter is now undefined, null or a function.
    depth = depth ?? get_tree_depth(root);
    if (typeof depth !== 'number') {
        throw new Error('depth must be a number');
    }
    const alphabet = get_tree_alphabet(root);
    // note: it is possible that:
    // * depth === 0
    // * alphabet.length === 0
    const node_rows = tree_by_depth(root, depth, alphabet);  // breadth-first organization of nodes
    const row_cell_widths = {};  // minimum cell width in each row, indexed by depth
    for (let d = 0; d <= depth; d++) {
        for (const n of node_rows[d]) {
            if (n) {
                const s_str = (typeof n.s === 'undefined') ? '' : `${n.s}`;
                const v     = value_getter ? value_getter(n) : undefined;
                const v_str = (typeof v === 'undefined') ? '' : `${v}`;
                row_cell_widths[d] = Math.max((row_cell_widths[d] ?? 0), s_str.length, v_str.length);
            }
        }
    }
    const overall_width = (alphabet.length <= 0)
          ? row_cell_widths[0]
          : Math.max(
              ...Object.keys(row_cell_widths).map(d => {
                  // add one: one space between cells
                  // subtract one: no initial space
                  const row_width = ((row_cell_widths[d] + 1) * alphabet.length**d) - 1;
                  return row_width;
              })
          );
    if (overall_width > max_format_overall_width) {
        throw new Error(`overall width ${overall_width} exceeds maximum ${max_format_overall_width}`);
    }
    const row_metrics = {};
    for (let d = 0; d <= depth; d++) {
        row_metrics[d] = [];
        const row_node_count = alphabet.length**d;  // note: 0**0 === 1, but 0**positive === 0
        for (let i = 0; i < row_node_count; i++) {
            // do these calculations to accomodate round-off errors
            const region_begin  = Math.trunc(((i + 0.0)*overall_width)/row_node_count);
            const region_center = Math.trunc(((i + 0.5)*overall_width)/row_node_count);
            const region_width  = Math.trunc(((i + 1.0)*overall_width)/row_node_count) - region_begin;
            row_metrics[d].push({
                begin:  region_begin,
                center: region_center,
                width:  region_width,
            });
        }
    }
    function get_start_pos(ctr, width, str) {
        const m = Math.round(ctr - str.length/2);
        if (m >= 0) {
            return m;
        } else {
            return Math.min(ctr, (width - str.length));
        }
    }
    // output_rows is indexed by depth, each entry containing an array of
    // specifications for lines to be output, and each specification
    // contains an array of segments to be joined to form the line.
    const output_rows = {};
    for (let d = 0; d <= depth; d++) {
        const row_connectors_line = [];
        const row_symbols_line    = [];
        const row_values_line     = [];
        output_rows[d] = [ row_connectors_line, row_symbols_line ];
        if (value_getter) {
            // row_values_line is used only if value_getter is defined
            output_rows[d].push(row_values_line);
        }
        const cell_width = row_cell_widths[d];
        let node_group_empty = false;
        let connector_pos = 0;
        const row_node_count = alphabet.length**d;  // note: 0**0 === 1, but 0**positive === 0
        for (let i = 0; i < row_node_count; i++) {
            if (alphabet.length > 0 && i % alphabet.length === 0) {
                node_group_empty = true;
                for (let g = i; g < i + alphabet.length; g++) {
                    if (node_rows[d][g]) {
                        // at least one in this alphabet group is not empty
                        node_group_empty = false;
                        break;
                    }
                }
            }
            const node = node_rows[d][i];  // node may be undefined
            const { begin, center, width } = row_metrics[d][i];
            const ctr = center-begin;  // center relative to current node
            if (node_group_empty) {
                const blank_connector_size = center-connector_pos + connector_node_fill.length;
                row_connectors_line.push(repeated(blank_connector_size, ' '));
                connector_pos += blank_connector_size;
            } else {
                if (alphabet.length === 0 || i % alphabet.length === 0) {
                    const indent_size = center-connector_pos;
                    row_connectors_line.push(repeated(indent_size, ' '));
                    const node_marker = (d === 0) ? connector_root_fill : connector_node_fill;
                    row_connectors_line.push(node_marker);
                    connector_pos += (indent_size + node_marker.length);
                } else {
                    const connector_size = center-connector_pos;
                    row_connectors_line.push(repeated(connector_size, connector_fill));
                    row_connectors_line.push(connector_node_fill);
                    connector_pos += (connector_size + connector_node_fill.length);
                }
            }
            if (d !== 0) {  // skip d === 0: do not display symbol for root node
                const s_str   = (!node || typeof node.s === 'undefined') ? '' : `${node.s}`;
                const s_start = get_start_pos(ctr, width, s_str);
                row_symbols_line.push(repeated(s_start, ' '));
                row_symbols_line.push(s_str);
                row_symbols_line.push(repeated(width - s_start - s_str.length, ' '));
            }
            if (value_getter) {
                const v       = !node ? '' : value_getter(node);
                const v_str   = (typeof v === 'undefined') ? '' : `${v}`;
                const v_start = get_start_pos(ctr, width, v_str);
                row_values_line.push(repeated(v_start, ' '));
                row_values_line.push(v_str);
                row_values_line.push(repeated(width - v_start - v_str.length, ' '));
            }
        }
    }
    return Object.keys(output_rows).sort(number_comparator).map(d => {
        const row = output_rows[d];
        return row
            .filter(line_segments => (line_segments.length > 0))
            .map(line_segments => line_segments.join('').trimEnd()).join('\n');
    }).join('\n').trimEnd();
}

// return a string whose length is given by count, composed of fill, repeated.
export function repeated(count, fill=' ') {
    count = Math.round(count);
    if (count <= 0 || fill.length <= 0) {
        return '';
    }
    let s = fill;
    while (true) {
        const remaining = count - s.length;
        if (remaining === 0) {
            break;
        } else if (remaining < 0) {
            s = s.substring(0, count);
        } else if (remaining > s.length) {
            s = s + s;
        } else {
            s = s + s.substring(0, remaining);
        }
    }
    return s;
}


// === TREE CLASSES ===

// base class for trees
export class Tree {
    // root_or_make_node_fn must be the root of the tree, or else a
    // function.  If a function, it will be assigned to this._make_node
    // and must be callable with no arguments to create a root node (other
    // than that, it can have any desired signature).
    constructor(root_or_make_node_fn) {
        if (typeof root_or_make_node_fn === 'function') {
            this._make_node = root_or_make_node_fn;
            this._root = this._make_node();
        } else {
            this._root = root_or_make_node_fn;
        }
    }

    get root() {
        return this._root;
    }

    // return the maximum node depth that currently exists
    get_depth() {
        return get_tree_depth(this.root);
    }

    // return the alphabet, as currently used in the nodes
    get_alphabet() {
        return get_tree_alphabet(this.root);
    }

    static descend_from(node, path) {
        let final_node = node;
        for (const s of path) {
            if (!final_node) {
                break;
            }
            final_node = final_node.branch[s];
        }
        return final_node;
    }

    descend(path) {
        return this.constructor.descend_from(this.root, path);
    }

    // May throw an error, but only if one of the functions in options does.
    // Recursively walk the tree, depth-first.
    // options: {
    //     before?:           ({ node, s, depth, parent, sn }) => (),
    //     after?:            ({ node, s, depth, parent, sn }) => (),
    //     alphabet?:         (String|Symbol|Number)[],
    //     max_depth?:        number,
    //     exclude_interior?: boolean,  // only nodes with children
    //     exclude_shallow?:  boolean,  // only nodes at depth = (options.max_depth ?? maximum_tree_depth)
    //     abortable?:        boolean,  // if true, returning non-falsy value from a callback will terminate the walk and return that value
    //     include_path?:     boolean,  // if true, also pass "path", an array of symbols, to before/after.
    // }
    // Note: alphabet, if specified, is the alphabet to be used when traversing
    // child nodes.  If not given, then get_tree_alphabet(root) will be used.
    // This is the basis for forming the sn (serial number) parameter to the
    // before/after callback functions.  For each node, sn is the 0-based visit
    // number of an in-order, depth-first traversal of a full tree (if the tree
    // is not full, missing nodes' sn values will be skipped).  The sn value is
    // consistent from tree-to-tree with the same alphabet size.
    walk(options) {
        return walk_tree(this.root, options);
    }
}

export class CountTree extends Tree {
    constructor(max_depth=6) {
        super(function (parent, s=null) {
            return make_tree_node(s, {
                depth: parent ? parent.depth + 1 : 0,
                count: 0,
            });
        });
        if (!Number.isInteger(max_depth) || max_depth < 0) {
            throw new Error('max_depth must be a non-negative integer');
        }
        this._max_depth = max_depth;
        this._insertion_points = [];
        // once this._finishing is set to true, this._root will no participate
        // in populating this._insertion_points, meaning that subsequent
        // calls to this.observe() will only affect paths of the tree
        // that are only "in progress", and those will eventually dissapate
        // as well.  No api is provided to set this._finishing back to false;
        // once true it stays true.
        this._finishing = false;
    }

    get max_depth() {
        return this._max_depth;
    }

    get finishing() {
        return this._finishing;
    }

    finish() {
        this._finishing = true;
    }

    get is_complete() {
        return (this._insertion_points.length <= 0);
    }

    // Returns true iff s was added to the stats.
    // Note: s is not added if (this.finishing && this.is_complete).
    observe(s) {
        let added = false;
        const ip = this._insertion_points;
        if (!this.finishing) {
            // count the empty prefix and start a new path
            this.root.count++;
            added = true;
            if (this.max_depth > 0) {
                ip.push(this.root);
            }
        }
        this._insertion_points = [];  // rebuild
        for (const n of ip) {
            const next = (n.branch[s] = (n.branch[s] ?? this._make_node(n, s)));
            next.count++;
            added = true;
            if (next.depth < this.max_depth) {
                this._insertion_points.push(next);
            }
        }
        return added;
    }

    probability_tree() {
        return new ProbabilityTree(clone_tree(this.root));
    }

    format(value_getter='count', depth) {
        return format_tree(this.root, value_getter, depth);
    }
}

// Not exporting this class ProbabilityTree; instead
// instances are returned from CountTree.probability_tree().
// Whereas CountTree instances are potentially dynamic, with
// the structure and alphabet growing as time goes on, it is
// expected that ProbabilityTree instances have a fixed
// structure and alphabet.  (However, if the structure or
// alphabet do change, the update_stats() method can be called.)
class ProbabilityTree extends Tree {
    constructor(root) {
        super(root);
        this._index = undefined;  // initialized in update_stats()
        this.update_stats();
    }

    get index (){ return this._index; }  // gsn->node mapping

    // update_stats() is called in the constructor.
    // there is no further need to call it unless the tree is modified.
    // Also, gsn ("global serial number") is set in each node.
    update_stats() {
        function probability_from(c, n) {
            c = c ?? 0;
            n = n ?? 0;
            return (n === 0) ? ((c === 0) ? 0 : 1) : c/n;
        }
        // First:
        // - set the gsn (global serial number) in each node
        // - create an index of all the nodes (gsn->node) stored in this._index
        // - compute the probabilities in each node
        this._index = {};  // gsn->node mapping
        const root_count = this.root.count;
        this.walk({
            before: ({ node, parent, sn }) => {
                node.gsn = sn;  // "global serial number"
                this._index[node.gsn] = node;
                node.pw  = probability_from(node.count, root_count);   // word probability
                node.ps  = probability_from(node.pw,    parent?.pw);   // symbol probability (conditioned on previous symbol)
                node.bpw = (node.pw === 0) ? 0 : -Math.log2(node.pw);  // log2(1/node.pw) or 0 if node.pw is zero
                node.bps = (node.ps === 0) ? 0 : -Math.log2(node.ps);  // log2(1/node.ps) or 0 if node.ps is zero
            },
        })
    }

    get_causal_states(future_window, past_window=0) {
        const tree_depth = this.get_depth();
        if (!Number.isInteger(future_window) || future_window <= 0) {
            throw new Error('future_window must be positive integer');
        }
        if (!Number.isInteger(past_window) || past_window < 0) {
            throw new Error('past_window must be a non-negative integer');
        }
        if (past_window+future_window > tree_depth) {
            throw new Error(`past_window+future_window must not be greater than current tree depth (${tree_depth})`);
        }

        // use a consistent alphabet so that subtree nodes' sn values match up.
        const alphabet = this.get_alphabet();

        // === information to be gathered in the first walk ===
        // for nodes that have a depth=future_window subtree, subtree_info records
        // information associated with each subtree: {
        //     leaf_info: {
        //         leaf:       object,    // sn->leaf_node mapping
        //         parent:     object,    // sn->leaf_parent mapping (leaf_parent may be undefined if subtree depth < 1, but should never happen)
        //         rel_stats:  object,    // sn->{ pw: number, bpw: number } mapping; stats relative to subtree root
        //         sn_list:    number[],  // array of leaf sn values, ordered least-first
        //         sig:        string,    // a "signature" of the leaf nodes (for comparison)
        //         leaf_count: number,    // number of leaf nodes
        //     },
        //     entropy: number,  // entropy of subtree
        // }
        const subtree_info = {};  // gsn->info mapping
        this.walk({
            alphabet,
            max_depth: past_window,
            exclude_shallow: true,
            before: ({ node: past_end, sn: past_end_sn }) => {
                // walk all nodes that start the possible subtrees
                walk_tree(past_end, {
                    alphabet,
                    max_depth: tree_depth-past_window-future_window,
                    before: ({ node: subtree_root }) => {
                        const leaf_info = {  // (values will be populated below)
                            leaf:       {},  // sn->node mapping
                            parent:     {},  // sn->leaf_parent mapping (leaf_parent may be undefined if subtree depth < 1, but should never happen)
                            rel_stats:  {},  // stats relative to subtree root node
                            sn_list:    [],  // list of sn values for leaf nodes
                            sig:        '',  // leaf node signature to detect topological equivalence
                            leaf_count: 0,   // count of leaf nodes
                        };
                        // walk the nodes of the subtree rooted at subtree_root
                        walk_tree(subtree_root, {
                            alphabet,
                            max_depth: future_window,
                            exclude_shallow: true,
                            before: ({ node, parent, sn }) => {
                                leaf_info.leaf[sn] = node;
                                leaf_info.parent[sn] = parent;
                                leaf_info.rel_stats[sn] = {
                                    pw:  node.pw  / subtree_root.pw,  // assume: all pw values > 0
                                    bpw: node.bpw - subtree_root.bpw,
                                };
                                leaf_info.sn_list.push(sn);
                            }
                        });
                        leaf_info.sig = leaf_info.sn_list.join(',');
                        leaf_info.leaf_count = leaf_info.sn_list.length;
                        let entropy = 0;
                        for (const leaf_sn of leaf_info.sn_list) {
                            const rel_stats = leaf_info.rel_stats[leaf_sn];
                            entropy += rel_stats.pw * rel_stats.bpw;
                        }
                        const info = {
                            leaf_info,
                            entropy,
                        };
                        subtree_info[subtree_root.gsn] = info;
                    },
                });
            },
        });
        const subtree_gsn_list = Object.keys(subtree_info).map(n => +n).sort(number_comparator);

        // Now compute the directed_distance between each pair of subtrees.
        // Note that in general directed_distance[gsn1][gsn2] !== directed_distance[gsn2][gsn1].
        const directed_distance = {};  // gsn1->gsn2->distance_value mapping
        for (const gsn1 of subtree_gsn_list) {
            const si1 = subtree_info[gsn1];
            const directed_distance_gsn1 = {};
            for (const gsn2 of subtree_gsn_list) {
                let distance_value;
                if (gsn1 === gsn2) {
                    distance_value = 0;
                } else {
                    const si2 = subtree_info[gsn2];
                    // directed distance value calculation
                    // -----------------------------------
                    // Using Kullback–Leibler divergence, aka relative entropy.
                    // This is not a metric because it is not symmetric, and
                    // does not satisfy the triangle inequality, However, it
                    // is easy to interpret in terms of bits: it is the average
                    // additional number of bits per symbol requried to encode
                    // a sequence that is actually distributed as P but using
                    // a model based on distribution Q.
                    //
                    // d(P,Q) = SUM[ p*-log(q) ] - SUM[ p*-log(p) ]
                    //        = SUM[ p*-log(q) ] - H[P]
                    //
                    // d(P,Q) = Infinity if (p === 0 XOR q === 0) for some (p, q)
                    if (si1.leaf_info.sig !== si2.leaf_info.sig) {
                        distance_value = Infinity;
                    } else {
                        distance_value = 0;
                        // note: si1.leaf_info.sn_list is the same as si2.leaf_info.sn_list
                        for (const leaf_sn of si1.leaf_info.sn_list) {
                            const rs1 = si1.leaf_info.rel_stats[leaf_sn];
                            const rs2 = si2.leaf_info.rel_stats[leaf_sn];
                            const d_inc = rs1.pw * rs2.bpw;
                            distance_value += d_inc;
                        }
                        distance_value -= si1.entropy;
                        if (distance_value < 0) {
                            // must be negative because of rounding errors
                            distance_value = 0;
                        }
                    }
                }
                directed_distance_gsn1[gsn2] = distance_value;
            }
            directed_distance[gsn1] = directed_distance_gsn1;
        }

        // Now compute a symmetric distance between each node.
        // This is just an average of the forward and reverse distances.
        const average_directed_distance = {};
        let max_finite_distance  = 0;
        let min_nonzero_distance = Infinity;
        for (const gsn1 of subtree_gsn_list) {
            const average_directed_distance_gsn1 = {};
            for (const gsn2 of subtree_gsn_list) {
                const d = (directed_distance[gsn1][gsn2] + directed_distance[gsn2][gsn1]) / 2;
                average_directed_distance_gsn1[gsn2] = d;
                if (d !== Infinity && d > max_finite_distance) {
                    max_finite_distance = d;
                }
                if (d !== 0 && d < min_nonzero_distance) {
                    min_nonzero_distance = d;
                }
            }
            average_directed_distance[gsn1] = average_directed_distance_gsn1;
        }

        // Now compute the Jensen-Shannon distance between each node.
        // This distance is a true metric.
        const jsd_distance = {};  // gsn1->gsn2->distance_value mapping
        for (const gsn1 of subtree_gsn_list) {
            const si1 = subtree_info[gsn1];
            const jsd_distance_gsn1 = {};
            for (const gsn2 of subtree_gsn_list) {
                let distance_value;
                if (gsn1 === gsn2) {
                    distance_value = 0;
                } else {
                    const si2 = subtree_info[gsn2];
                    // JSD distance value calculation
                    // ------------------------------
                    // Using Jensen-Shannon distance.
                    // See: https://en.wikipedia.org/wiki/Jensen%E2%80%93Shannon_divergence
                    //
                    // Where M = (P + q)/2:
                    //
                    //     dp = SUM[ p*-log(m) ] - SUM[ p*-log(p) ]
                    //        = SUM[ p*-log(m) ] - H[P]
                    //
                    //     dq = SUM[ q*-log(m) ] - SUM[ q*-log(q) ]
                    //        = SUM[ q*-log(m) ] - H[Q]
                    //
                    // d(P,Q) = sqrt( (dp + dq)/2 )  // this is a metric
                    //
                    // Special case for this implementation:
                    // d(P,Q) = Infinity if (p === 0 XOR q === 0) for some (p, q)
                    //
                    // When using log base 2, 0 <= d(P, Q) <= 1.
                    if (si1.leaf_info.sig !== si2.leaf_info.sig) {
                        distance_value = Infinity;
                    } else {
                        distance_value = 0;
                        // note: si1.leaf_info.sn_list is the same as si2.leaf_info.sn_list
                        for (const leaf_sn of si1.leaf_info.sn_list) {
                            const rs1 = si1.leaf_info.rel_stats[leaf_sn];
                            const rs2 = si2.leaf_info.rel_stats[leaf_sn];
                            const m_pw  = (rs1.pw + rs2.pw)/2;
                            const m_bpw = -Math.log2(m_pw);
                            const d_inc = rs1.pw*m_bpw + rs2.pw*m_bpw;
                            distance_value += d_inc;
                        }
                        distance_value = distance_value - si1.entropy - si2.entropy;
                        if (distance_value < 0) {
                            // must be negative because of rounding errors
                            distance_value = 0;
                        } else {
                            distance_value = Math.sqrt(distance_value);
                        }
                    }
                }
                jsd_distance_gsn1[gsn2] = distance_value;
            }
            jsd_distance[gsn1] = jsd_distance_gsn1;
        }

        // select one distance measure as standard
        const distance = jsd_distance;

        // All subtree info is now gathered, plus the distances between each.
        // Separate into equivalence classes. First: topologically:

        const topo = [];  // array of arrays of subtree gsn values
        {
            const subtrees_to_be_processed = new Set();
            for (const gsn of subtree_gsn_list) subtrees_to_be_processed.add(gsn);
            while (subtrees_to_be_processed.size > 0) {
                const subtree = subtrees_to_be_processed.values().next().value;
                const related = Object.entries(distance[subtree])
                      .filter(([ gsn, d ]) => (d !== Infinity))
                      .map(([ gsn, d ]) => +gsn);
                for (const gsn of related) subtrees_to_be_processed.delete(gsn);
                topo.push(related);
            }
        }

        const topo_partitions = topo
              .map(topo_equiv_subtrees => {  // map over each topological equivalence class
                  // gather data as an array of value vectors, one value vector
                  // per topological partition class, and each value vector
                  // a distinguishing value #bits for each path in each class
                  // member's individual paths.
                  const data = topo_equiv_subtrees.map(subtree_gsn => {  // map over each topologically-equivalent subtree
                      const subtree_root = this.index[subtree_gsn];
                      const leaf_info = subtree_info[subtree_gsn].leaf_info;
                      const subtree_value_vec = leaf_info.sn_list.map(leaf_sn => {  // map over each path (leaf) within that subtree
                          const rel_stats = leaf_info.rel_stats[leaf_sn];
                          return rel_stats.pw;
                      });
                      return {
                          subtree_gsn,
                          value: subtree_value_vec,
                      };
                  });
                  const p = new Partition(data);
                  p.find_best();
                  return p.partition;
              });

        const causal_states = [];  // array of arrays of subtree gsn values
        for (const partition of topo_partitions) {
            for (const s of partition.sets) {
                causal_states.push(s.members.map(m => m.subtree_gsn));
            }
        }

        return {
            subtree_gsn_list,
            directed_distance,
            average_directed_distance,
            jsd_distance,
            distance,
            topo,
            topo_partitions,
            causal_states,
        };
    }

    format(value_getter='ps', depth) {
        return format_tree(this.root, value_getter, depth);
    }
}


// === MultiSampleTree class ===

export class MultiSampleTree extends Tree {
    // May throw an error.
    constructor(source_generator, sample_size, sample_count, max_depth=6) {
        super(function (parent, s=null) {
            return make_tree_node(s, {
                depth:  parent ? parent.depth + 1 : 0,
                counts: [],
                count_stats: undefined,  // will be initialized in _summarize_stats()
            });
        });
        if (!Number.isInteger(sample_size) || sample_size <= 0) {
            throw new Error('sample_size must be positive integer');
        }
        if (!Number.isInteger(sample_count) || sample_count <= 0) {
            throw new Error('sample_count must be positive integer');
        }
        if (!Number.isInteger(max_depth) || max_depth < 0) {
            throw new Error('max_depth must be a non-negative integer');
        }
        this._source_generator = source_generator;
        this._sample_size      = sample_size;
        this._sample_count     = sample_count;
        this._max_depth        = max_depth;
        this._index            = undefined;  // initialized in _add_sample(), part of the initialization process below
        const sample_stream = this.source_generator();
        for (let i = 0; i < sample_count; i++) {
            const sample = this._make_sample(sample_stream, i);
            this._add_sample(sample, i);
        }
        this._summarize_stats();
    }

    get source_generator (){ return this._source_generator; }
    get sample_size      (){ return this._sample_size; }
    get sample_count     (){ return this._sample_count; }
    get max_depth        (){ return this._max_depth; }
    get index            (){ return this._index; }

    _make_sample(sample_stream, sample_i) {
        const count_tree = new CountTree(this.max_depth);
        for (let i = 0; i < this.sample_size; i++) {
            const input = sample_stream.next();
            if (typeof input.value === 'undefined' && input.done) {
                throw new Error(`sample stream exhausted; sample_i=${sample_i}, i=${i}`);
            }
            count_tree.observe(input.value);
            if (i >= this.sample_size-count_tree.max_depth) {
                count_tree.finish();  // calling multiple times does not matter
            }
        }
        if (!count_tree.is_complete) {
            console.warn(`** count_tree tree incomplete${(this.sample_size < depth) ? ' because not enough input' : ''}`);
        }
        return count_tree;
    }

    _add_sample(sample, sample_i) {
        const alphabet = this.get_alphabet();
        const sample_alphabet = sample.get_alphabet();
        for (const s of sample_alphabet) {
            if (!alphabet.includes(s)) {
                alphabet.push(s);
            }
        }
        alphabet.sort();
        const alphabet_size = alphabet.length;
        // establish new index and node gsn values based on (potentially new) alphabet
        this._index = {};
        this.walk({
            alphabet,
            before: ({ node, s, depth, parent, sn: gsn }) => {
                node.gsn = gsn;
                this.index[gsn] = node;
            },
        });
        // for each sample count, add sample count this tree's corresponding node
        sample.walk({
            alphabet,
            before: ({ node, s, sn: gsn }) => {
                let this_node = this.index[gsn];
                if (!this_node) {
                    const this_parent_node = this.index[tree_parent_sn(gsn, alphabet_size)];
                    if (!this_parent_node) {
                        throw new Error('unexpected: parent node not found');
                    } else if (this_parent_node.branch[s]) {
                         throw new Error(`unexpected: child node not in index but parent node has a branch for it (symbol ${s})`);
                    }
                    this_node = (this_parent_node.branch[s] = this._make_node(this_parent_node, s));
                    this_node.gsn = gsn;
                    this.index[gsn] = this_node;
                }
                // catch this_node.counts up to sample_i-1 values
                for (let i = this_node.counts.length; i < sample_i-1; i++) {
                    this_node.counts.push(0);
                }
                this_node.counts.push(node.count);
            },
        });
    }

    _summarize_stats() {
        const alphabet = this.get_alphabet();
        this._index = {};  // rebuild index
        this.walk({
            alphabet,
            before: ({ node, sn: gsn }) => {
                node.gsn = gsn;
                this.index[gsn] = node;
                // catch node.counts up to this.sample_count values
                for (let i = node.counts.length; i < this.sample_count; i++) {
                    node.counts.push(0);
                }
                node.count_stats = get_stats(node.counts);
            },
        });
    }

    get_causal_states(future_window, past_window=0) {
        const tree_depth = this.get_depth();
        if (!Number.isInteger(future_window) || future_window <= 0) {
            throw new Error('future_window must be positive integer');
        }
        if (!Number.isInteger(past_window) || past_window < 0) {
            throw new Error('past_window must be a non-negative integer');
        }
        if (past_window+future_window > tree_depth) {
            throw new Error(`past_window+future_window must not be greater than current tree depth (${tree_depth})`);
        }

        // === information to be gathered in the first walk ===
        // for nodes that have a depth=future_window subtree, subtree_info records
        // information associated with each subtree: {
        //     leaf_info: {
        //         leaf:       object,    // sn->leaf_node mapping
        //         parent:     object,    // sn->leaf_parent mapping (leaf_parent may be undefined if subtree depth < 1, but should never happen)
        //         rel_stats:  object,    // sn->{ pw: number, bpw: number } mapping; stats relative to subtree root
        //         sn_list:    number[],  // array of leaf sn values, ordered least-first
        //         sig:        string,    // a "signature" of the leaf nodes (for comparison)
        //         leaf_count: number,    // number of leaf nodes
        //     },
        // }
        const subtree_info = {};  // gsn->info mapping
        this.walk({
            alphabet,
            max_depth: past_window,
            exclude_shallow: true,
            before: ({ node: past_end, sn: past_end_sn }) => {
                // walk all nodes that start the possible subtrees
                walk_tree(past_end, {
                    alphabet,
                    max_depth: tree_depth-past_window-future_window,
                    before: ({ node: subtree_root }) => {
                        const leaf_info = {  // (values will be populated below)
                            leaf:       {},  // sn->node mapping
                            parent:     {},  // sn->leaf_parent mapping (leaf_parent may be undefined if subtree depth < 1, but should never happen)
                            sn_list:    [],  // list of sn values for leaf nodes
                            sig:        '',  // leaf node signature to detect topological equivalence
                            leaf_count: 0,   // count of leaf nodes
                        };
                        // walk the nodes of the subtree rooted at subtree_root
                        walk_tree(subtree_root, {
                            alphabet,
                            max_depth: future_window,
                            exclude_shallow: true,
                            before: ({ node, parent, sn }) => {
                                leaf_info.leaf[sn] = node;
                                leaf_info.parent[sn] = parent;
                                leaf_info.sn_list.push(sn);
                            }
                        });
                        leaf_info.sig = leaf_info.sn_list.join(',');
                        leaf_info.leaf_count = leaf_info.sn_list.length;
                        const info = {
                            leaf_info,
                        };
                        subtree_info[subtree_root.gsn] = info;
                    },
                });
            },
        });
        const subtree_gsn_list = Object.keys(subtree_info).map(n => +n).sort(number_comparator);

        const topo = [];  // array of arrays of subtree gsn values
        {
            const sig_set = {};  // sig->set mapping
            for (const subtree_gsn of subtree_gsn_list) {
                const sig = subtree_info[subtree_gsn].leaf_info.sig;
                if (!sig_set[sig]) {
                    const new_set = [];
                    sig_set[sig] = new_set;
                    topo.push(new_set);
                }
                sig_set[sig].push(subtree_gsn);
            }
        }

        const topo_partitions = topo
              .map(topo_equiv_subtrees => {  // map over each topological equivalence class
                  // gather data as an array of value vectors, one value vector
                  // per topological partition class, and each value vector
                  // a distinguishing value #bits for each path in each class
                  // member's individual paths.
                  const data = topo_equiv_subtrees.map(subtree_gsn => {  // map over each topologically-equivalent subtree
                      const subtree_root_counts = this.index[subtree_gsn].counts;
                      const leaf_info = subtree_info[subtree_gsn].leaf_info;
                      const subtree_value_variance_vec = leaf_info.sn_list.map(leaf_sn => {  // map over each path (leaf) within that subtree
                          const subtree_leaf_counts = leaf_info.leaf[leaf_sn].counts;
                          const ebw_values = subtree_leaf_counts.map((sct, i) => {  // expected bits for word
                              if (sct === 0) {
                                  return 0;  // 0*log(0) is defined to be 0
                              } else {
                                  const pw = sct/subtree_root_counts[i];
                                  return pw * -Math.log2(pw);
                              }
                          });
                          const ebw_stats = get_stats(ebw_values);
                          return ebw_stats;
                      });
                      return {
                          subtree_gsn,
                          value:    subtree_value_variance_vec.map(({ mu       }) => mu),
                          variance: subtree_value_variance_vec.map(({ variance }) => variance),
                      };
                  });
                  const p = new Partition(data);
                  p.find_best();
                  return p.partition;
              });

        const causal_states = [];  // array of arrays of subtree gsn values
        for (const partition of topo_partitions) {
            for (const s of partition.sets) {
                causal_states.push(s.members.map(m => m.subtree_gsn));
            }
        }

        return {
            subtree_info,
            subtree_gsn_list,
            topo,
            topo_partitions,
            causal_states,
        };
    }

    format(value_getter='counts', depth) {
        return format_tree(this.root, value_getter, depth);
    }
}

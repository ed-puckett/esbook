// k-means clustering implementation

const {
    default_epsilon,
    vec_distance_squared_between,
    vec_get_stats,
    vec_stats_equal_within_epsilon,
} = await import('lib/cmjs/tree-data.js');

export const default_value_variance = 0;


// === "GOODNESS OF FIT" FUNCTIONS ===

export function partition_score(partition) {
    const average_sum_squared_errors = partition.sets.reduce((acc, s) => {
        const sum_path_variances = s.stats.variance.reduce((acc, v) => (acc + v), 0);
        return (acc + sum_path_variances/partition.dim);
    }, 0);
    return average_sum_squared_errors/partition.sets.length;
}

export function centers_too_close(partition) {
    if (partition.k < 2) {
        return false;  // centers can't get further apart; there is only one set
    } else {
        const sum_center_variance = partition.center_stats.variance.reduce((acc, v) => (acc + v), 0)
        for (const s of partition.sets) {
            const max_set_data_variance = s.members.reduce((acc, d) => {
                for (const i in d.variance) {
                    if (!(i in acc)) {
                        acc[i] = d.variance[i];
                    } else {
                        acc[i] = Math.max(acc[i], d.variance[i]);
                    }
                }
                return acc;
            }, []);
            const sum_max_set_data_variance = max_set_data_variance.reduce((acc, v) => (acc + v), 0);
            if (sum_max_set_data_variance > sum_center_variance) {
                return true;  // data is more variable than center separation
            }
        }
        return false;
    }
}


// === Partition class ===

export class Partition {
    // May throw an error.
    //
    // data: {
    //     value:     number[],
    //     variance?: number[],  // default value: default_value_variance[]
    // }[]
    //
    // options: {
    //     epsilon?: number,  // default value: default_epsilon
    // }
    constructor(data, options) {
        options = options ?? {};
        options.epsilon = options.epsilon ?? default_epsilon;
        const dim = _validate_data(data);  // will throw an error if not valid
        if (typeof options.epsilon !== 'number' || options.epsilon <= 0) {
            throw new Error('epsilon must be a positive number');
        }
        this._data      = data;
        this._dim       = dim;
        this._epsilon   = options.epsilon;
        this._partition = undefined;  // set/reset by find_best(), go() and reset()
    }

    get data      (){ return this._data; }
    get dim       (){ return this._dim; }
    get epsilon   (){ return this._epsilon; }
    get partition (){ return this._partition; }

    // May throw an error.
    // Return a partition structure with the "best" k.
    find_best() {
        const k_max = this.go(this.data.length).partition.k;  // assume k will be reduced if fewer unique values
        const k_max_score = partition_score(this.partition);
        const k_min = this.go(1).partition.k;
        if (k_min != 1) {
            throw new Error('unexpected: k_min != 1');
        }
        const k_min_score = partition_score(this.partition);
        if (k_min !== k_max) {  // otherwise done
            const elbow_slope = (k_max_score - k_min_score) / (k_max - k_min);
            const scores = {
                [k_min]: k_min_score,
                [k_max]: k_max_score,
            };
            let last_partition = this.partition;
            for (let k = last_partition.k+1; k < k_max; last_partition = this.partition, k++) {
                scores[k] = partition_score(this.go(k).partition);
                const slope = (scores[k] - scores[last_partition.k]) / (k - last_partition.k);
                if (slope >= elbow_slope || centers_too_close(this.partition)) {
                    this._partition = last_partition;
                    break;  // done
                }
            }
        }
    }

    // May throw an error.
    // Returns a partition structure computed for value k.
    // The final partition may have a lesser k if some
    // sets end up empty.
    go(k) {
        this.reset(k);
        const max_attempts = 1000;
        for (let attempt = 0; this.partition_by_centers().recalculate_stats(); attempt++) {
            // Keep looping until recalculate_stats() returns false
            // indicating no additional change.  However, prevent this
            // from happening indefinitely....
            if (attempt >= max_attempts) {
                // output the final two attempts for comparison
                console.warn(`** not converging; attempt #${attempt}`, this.partition);
                if (attempt > max_attempts) {
                    throw new Error(`aborting after ${attempt} attempts (k=${k})`);
                }
            }
        }
        this.prune_empty_sets();
        return this;  // for chaining
    }

    // === LOWER-LEVEL METHODS USED BY go() ===

    // May throw an error.
    // Reset state for a new value of k.
    // The returned partition's actual k may differ from the specified value.
    reset(k) {
        const new_partition = generate_intitial_partition(k, this.data, this.epsilon);
        if (new_partition.dim !== this.dim) {
            throw new Error('unexpected inconsistency between dim and computed dim');
        }
        // assign to this._partition last in case an error was thrown
        this._partition = new_partition;
        return this;  // for chaining
    }

    // May throw an error.
    // find_best(), go() or reset() must have been called before calling this method.
    partition_by_centers() {
        if (!this.partition) {
            throw new Error('partition uninitialized; call reset() before calling this function');
        }
        partition_by_centers(this.partition);
        return this;  // for chaining
    }

    // May throw an error.
    // find_best(), go() or reset() must have been called before calling this method.
    recalculate_stats() {
        if (!this.partition) {
            throw new Error('partition uninitialized; call reset() before calling this function');
        }
        return recalculate_stats(this.partition);
    }

    // may throw an error.
    // find_best(), go() or reset() must have been called before calling this method.
    prune_empty_sets() {
        if (!this.partition) {
            throw new Error('partition uninitialized; call reset() before calling this function');
        }
        prune_empty_sets(this.partition);
        return this;  // for chaining
    }
}


// === IMPLEMENTATION FUNCTIONS ===

// May throw an error.
// May return a partition with a smaller k if there are too few data values.
// The sets in the returned partition are all empty; partition_by_centers()
// should be called immediately.
export function generate_intitial_partition(k, data, epsilon=default_epsilon) {
    if (typeof epsilon !== 'number' || epsilon <= 0) {
        throw new Error('epsilon must be a positive number');
    }
    if (!Number.isInteger(k) || k <= 0) {
        throw new Error('k must be a positive integer');
    }
    const dim = _validate_data(data);  // will throw an error if not valid
    // adjust k; k will be no larger than the number of data values
    k = Math.min(k, data.length);
    // initialize partition
    const values = data.map(d => d.value);
    const stats  = vec_get_stats(dim, values);
    const partition = {
        data,
        dim,
        k,
        epsilon,
        stats,
        center_stats: undefined,  // will be set below
        sets: [],  // will be populated below
    };
    // Initialize k sets with some center but with empty members.
    // Just use the first k data elements to get the centers.
    for (let ki = 0; ki < k; ki++) {
        const center = values[ki];
        partition.sets.push({
            stats: vec_get_stats(partition.dim, [ center ]),
            members: [],  // will be populated later by partition_by_centers()
        });
    }
    const centers = partition.sets.filter(s => s.stats).map(s => s.stats.center);
    partition.center_stats = vec_get_stats(partition.dim, centers);
    return partition;
}

// Each element partition.sets must have a center assigned.
export function partition_by_centers(partition) {
    for (const s of partition.sets) {
        s.members = [];
    }
    for (const d of partition.data) {
        const vec = d.value;
        let closest_set, closest_d2;
        for (const s of partition.sets) {
            if (s.stats) {
                const d2 = vec_distance_squared_between(partition.dim, s.stats.center, vec);
                if (!closest_set || closest_d2 > d2) {
                closest_set = s;
                    closest_d2  = d2;
                }
            }
        }
        closest_set.members.push(d);
    }
    return partition;
}

// Returns true iff at least one center changed by more than partition.epsilon.
export function recalculate_stats(partition) {
    let changed = false;
    const centers = partition.sets.filter(s => s.stats).map(s => s.stats.center);
    const center_stats = vec_get_stats(partition.dim, centers);
    if (!vec_stats_equal_within_epsilon(partition.dim, partition.center_stats, center_stats, partition.epsilon)) {
        partition.center_stats = center_stats;
        changed = true;
    }
    for (const s of partition.sets) {
        const values = s.members.map(m => m.value);
        const stats = vec_get_stats(partition.dim, values);
        if (!vec_stats_equal_within_epsilon(partition.dim, s.stats, stats, partition.epsilon)) {
            s.stats = stats;
            changed = true;
        }
    }
    return changed;
}

// prune empty sets, reset k to the number of sets, and sort the sets by center
export function prune_empty_sets(partition) {
    partition.sets = partition.sets.filter(s => (s.members.length > 0));
    partition.k = partition.sets.length;
    // must also recalculate partition.center_stats if empty sets were eliminated
    const centers = partition.sets.filter(s => s.stats).map(s => s.stats.center);
    const center_stats = vec_get_stats(partition.dim, centers);
    partition.center_stats = center_stats;
    return partition;
}

// Will throw an error if not valid.
// Returns the correct value for dim based on the given data.
function _validate_data(data) {
    if (!Array.isArray(data) || data.length < 1) {
        throw new Error('data must be an array with at least one element');
    }
    let dim;
    for (const d of data) {
        const vec = d.value;
        if (!Array.isArray(vec) || vec.length < 1) {
            throw new Error('data must be an array that itself contains non-empty arrays of numbers');
        }
        dim = dim ?? vec.length;
        if (dim !== vec.length) {
            throw new Error('data must be an array that itself contains arrays of numbers, all of which have the same length');
        }
        for (let i = 0; i < dim; i++) {
            const v = vec[i];
            if (typeof v !== 'number' || v === Infinity || v === -Infinity || isNaN(v)) {
                throw new Error('data must be an array that itself contains arrays of finite numbers');
            }
        }
    }
    return dim;
}

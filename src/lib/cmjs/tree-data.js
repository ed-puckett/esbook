// k-means clustering implementation

// default_epsilon is "close enough" when comparing numbers whose
// absolute value is near 1
export const default_epsilon = 10 * Number.EPSILON;


// may throw an error
export const number_comparator = (a, b) => (+a - +b);

// this function is expensive...
export function equal_within_espilon(a, b, epsilon=default_epsilon) {
    if (typeof epsilon !== 'number' || epsilon <= 0) {
        throw new Error('epsilon must be a positive number');
    }
    if (a == b) {
        return true;
    } else if (a === 0) {
        return (Math.abs(b) <= epsilon);
    } else if (b === 0) {
        return (Math.abs(a) <= epsilon);
    } else {
        const scale = 10**Math.round(Math.log10(Math.min(Math.abs(a), Math.abs(b))));
        return (Math.abs(a - b) <= scale*epsilon);
    }
}

export function get_stats(values) {
    const value_count = values.length;
    if (value_count <= 0) {
        return undefined;
    } else {
        const mu       = values.reduce((acc, n) => acc + n/value_count,           0);
        const variance = values.reduce((acc, n) => acc + (n - mu)**2/value_count, 0);
        const center   = mu;  // could be something else in the future
        return {
            mu,
            variance,
            center,
        };
    }
}

// this is expensive...
export function stats_equal_within_epsilon(stats1, stats2, epsilon=default_epsilon) {
    if (typeof epsilon !== 'number' || epsilon <= 0) {
        throw new Error('epsilon must be a positive number');
    }
    // if a stats value is undefined, then the stats
    // were "not defined" because there was no data
    const u1 = (typeof stats1 === 'undefined');
    const u2 = (typeof stats2 === 'undefined');
    if (u1 && u2) {
        return true;
    } else if ((u1 && !u2) || (!u1 && u2)) {
        return false;
    } else {
        if ( equal_within_espilon(stats1.mu,       stats2.mu,       epsilon) &&
             equal_within_espilon(stats1.variance, stats2.variance, epsilon) &&
             equal_within_espilon(stats1.center,   stats2.center,   epsilon)    ) {
            return true;
        } else {
            return false;
        }
    }
}

export function vec_distance_squared_between(dim, vec1, vec2) {
    let d2 = 0;
    for (let i = 0; i < dim; i++) {
        d2 += (vec1[i] - vec2[i])**2;
    }
    return d2;
}

// this function is expensive...
export function vec_equal_within_espilon(dim, vec1, vec2, epsilon=default_epsilon) {
    const d2 = vec_distance_squared_between(dim, vec1, vec2);
    const scale = 10**Math.round(Math.log10(d2));
    return (d2 <= scale*epsilon*epsilon);
}

export function vec_make_zero(dim) {
    const z = [];
    for (let i = 0; i < dim; i++) {
        z.push(0);
    }
    return z;
}

// Each value in values is assumed to be a vector represented as an array
// with length === dim and containing finite numbers.
export function vec_get_stats(dim, values) {
    const value_count = values.length;
    if (value_count <= 0) {
        return undefined;
    } else {
        const mu = vec_make_zero(dim);
        for (const vec of values) {
            for (let i = 0; i < dim; i++) {
                mu[i] += vec[i]/value_count;
            }
        }
        const variance = vec_make_zero(dim);
        for (const vec of values) {
            for (let i = 0; i < dim; i++) {
                variance[i] += (vec[i] - mu[i])**2/value_count;
            }
        }
        const center = mu;  // could be something else in the future
        return {
            mu,
            variance,
            center,
        };
    }
}

export function vec_stats_equal_within_epsilon(dim, stats1, stats2, epsilon=default_epsilon) {
    if (typeof epsilon !== 'number' || epsilon <= 0) {
        throw new Error('epsilon must be a positive number');
    }
    // if a stats value is undefined, then the stats
    // were "not defined" because there was no data
    const u1 = (typeof stats1 === 'undefined');
    const u2 = (typeof stats2 === 'undefined');
    if (u1 && u2) {
        return true;
    } else if ((u1 && !u2) || (!u1 && u2)) {
        return false;
    } else {
        if ( vec_equal_within_espilon(dim, stats1.mu,       stats2.mu,       epsilon) &&
             vec_equal_within_espilon(dim, stats1.variance, stats2.variance, epsilon) &&
             vec_equal_within_espilon(dim, stats1.center,   stats2.center,   epsilon)    ) {
            return true;
        } else {
            return false;
        }
    }
}

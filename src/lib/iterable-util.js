'use strict';

(async ({ current_script, facet, facet_export, facet_load_error }) => { try {  // facet begin

    const max_range_sources      = 100000;
    const default_max_iterations = 1000000;


    function is_iterable_like(thing) {
        return ( ['object', 'string'].includes(typeof thing) &&
                 typeof thing[Symbol.iterator] === 'function' );
    }
    function is_async_iterable_like(thing) {
        return ( ['object', 'string'].includes(typeof thing) &&
                 typeof thing[Symbol.asyncIterator] === 'function' );
    }


    // range(): iterator-based iterable creator
    function range(...args) {
        if (['undefined', 'number'].includes(typeof args[0])) {

            // range([start], limit, [options])
            // start default value: 0
            // options: number | boolean | {
            //     increment?: number,   // default value: 1
            //     inclusive?: boolean,  // default value: false
            // }
            // If options is a number, then it is the value for increment.
            // If options is a boolean, then it is the value for inclusive.

            let start, limit, options;
            if (args.length <= 0) {
                start = limit = 0;
            } else if (args.length === 1) {
                limit = args[0];
            } else {
                [ start, limit, options ] = args;
            }

            let increment = 1, inclusive = false;
            if (typeof options === 'number') {
                increment = options;
            } else if (typeof options === 'boolean') {
                inclusive = options;
            } else {
                ({
                    increment = 1,
                    inclusive = false,
                } = (options ?? {}));
            }

            if (!['undefined', 'number'].includes(typeof start)) {
                throw new TypeError('start must be a number');
            }
            if (!['undefined', 'number'].includes(typeof limit)) {
                throw new TypeError('limit must be a number');
            }
            if (!['undefined', 'number'].includes(typeof increment)) {
                throw new TypeError('increment must be a number');
            }

            // return the iterable:
            return iterable_extension({
                _start:     start ?? 0,
                _limit:     limit,
                _inclusive: !!inclusive,

                [Symbol.iterator]: function () {
                    const iterable = this;

                    // return the iterator:
                    return {
                        _iterable: iterable,
                        _index:    iterable._start,

                        next: (iterable._start <= iterable._limit)
                            ? ( function () {
                                const iterator = this;
                                const iterable = iterator._iterable;
                                if (iterable._inclusive ? (iterator._index <= iterable._limit) : (iterator._index < iterable._limit)) {
                                    const value = iterator._index;
                                    iterator._index += increment;
                                    return { value };
                                } else {
                                    return { done: true };
                                }
                            } )
                            : ( function () {
                                const iterator = this;
                                const iterable = iterator._iterable;
                                if (iterable._inclusive ? (iterator._index >= iterable._limit) : (iterator._index > iterable._limit)) {
                                    const value = iterator._index;
                                    iterator._index -= increment;
                                    return { value };
                                } else {
                                    return { done: true };
                                }
                            } ),

                        reset: function (n) {
                            const iterator = this;
                            const iterable = iterator._iterable;
                            if (typeof n === 'undefined') {
                                iterator._index = iterable._start;
                            } else {
                                if (typeof n !== 'number') {
                                    throw new TypeError('n must be a number');
                                }
                                iterator._index = n;
                            }
                        },
                    };
                },
            });

        } else if (typeof args[0] === 'string') {

            const [ str, right_to_left=false ] = args;
            const range_args = (str && right_to_left) ? [ Math.max(str.length-1, 0), 0, true ] : [ str.length ];
            return range(...range_args).map(i => str[i]);

        } else {

            // range(sources, right_to_left=false)
            // sources must be finite in length, whereas its contained iterables need not be.

            let [ sources, right_to_left=false ] = args;
            if (!is_iterable_like(sources)) {
                throw new TypeError('sources must be an iterable object');
            }
            if (!Array.isArray(sources)) {
                const sa = [];
                for (const source of sources) {
                    sa.push(source);
                    if (sa.length > max_range_sources) {
                        break;
                    }
                }
                sources = sa;
            }
            if (sources.length > max_range_sources) {
                throw new Error(`sources must not have more than ${max_range_sources} elements`);
            }
            for (const source of sources) {
                if (!is_iterable_like(source)) {
                    throw new TypeError('sources must be an iterable object containing iterable strings/objects');
                }
            }

            // at this point, sources is an array of iterables

            // return the iterable:
            return iterable_extension({
                _sources:       sources,
                _right_to_left: right_to_left,

                [Symbol.iterator]: function () {
                    const iterable = this;
                    const iters = iterable._sources.map(source => source[Symbol.iterator]());
                    const current = iters.map((iter, pos) => {
                        const r = iter.next();
                        return r.done ? undefined : r.value;
                    });

                    // return the iterator:
                    return {
                        _iterable: iterable,
                        _iters:    iters,
                        _current:  current,
                        _done:     false,

                        next: function () {
                            const iterator = this;
                            const iterable = iterator._iterable;
                            if (iterator._done) {
                                return { done: true };
                            }
                            const value = [ ...iterator._current ];
                            // attempt to get next value
                            for (
                                let pos = iterable._right_to_left ? iterator._iters.length-1 : 0;
                                iterable._right_to_left ? (pos >= 0) : (pos < iterator._iters.length);
                                iterable._right_to_left ? pos-- : pos++
                            ) {
                                const r = iterator._iters[pos].next();
                                if (r.done) {
                                    iterator._iters[pos] = iterable._sources[pos][Symbol.iterator]();  // reset
                                    const rr = iterator._iters[pos].next();
                                    iterator._current[pos] = rr.done ? undefined : rr.value;
                                    continue;  // continue to next position
                                } else {
                                    iterator._current[pos] = r.value;
                                    return { value };
                                }
                            }
                            // all iterators in _iters completed
                            iterator._done = true;  // set done status for next time
                            return { value };  // return the final value
                        },
                    };
                },
            });
        }
    }


    // Iterable wrapper to provide iterable-based methods like .map, .reduce, etc.
    // A Proxy wrapper is used to provide the additional methods rather than
    // modifying the original iterable or its prototype chain.
    // This handles both sync and async iterables.  However, the iterable must
    // not be/support both sync and async.
    function iterable_extension(iterable) {
        const supports_sync  = is_iterable_like(iterable);
        const supports_async = is_async_iterable_like(iterable);
        if (!supports_sync && !supports_async) {
            throw new TypeError('argument must be an iterable object');
        }
        if (supports_sync && supports_async) {
            throw new TypeError('argument must be sync or async iterable but not both');
        }
        return new Proxy(iterable, iterable_extension_handler);
    }

    // Given a generator function, return a new iterable
    // with extended methods provided by iterable_extension()
    function extended_iterable_from_generator(generator) {
        if (typeof generator !== 'function' || generator.length != 0) {
            throw new Error('generator must be a function requiring no arguments');
        }
        return iterable_extension({
            [Symbol.iterator]: generator,
        });
    }
    function async_extended_iterable_from_generator(generator) {
        if (typeof generator !== 'function' || generator.length != 0) {
            throw new Error('generator must be a function requiring no arguments');
        }
        return iterable_extension({
            [Symbol.asyncIterator]: generator,
        });
    }

    const iterable_extension_handler = {
        get: function (target, property, receiver) {
            const impl_gen = iterable_extension_handler_functions[property];
            if (impl_gen) {
                const async_ = is_async_iterable_like(target);
                const impl = impl_gen(target, async_);
                if (impl) {
                    return impl;
                }
            }

            const value = Reflect.get(target, property, receiver);
            // this may be over-broad, binding every function
            // note that the first bind() on a function wins
            const do_bind = (typeof value === 'function');
            return do_bind ? value.bind(target) : value;
        },
    };

    const iterable_extension_handler_functions = {
        // implementations for valueOf and toString methods
        // are provided to avoid anomalous results that have
        // been encountered when trying to output the proxied
        // object.  These anomalous results may be a consequence
        // of expressions being eval-ed, or of occurring in a
        // WebWorker context.
        toString: 'valueOf',
        valueOf: function (target, async_) {
            return function () {
                return `[object ${async_ ? 'async_' : ''}iterable]`;
            };
        },

        map: function (target, async_) {
            if (async_) {
                return function (fn, use_bigint=false) {
                    return async_extended_iterable_from_generator(async function* () {
                        let i = 0n;
                        for await (const element of target) {
                            const n = use_bigint ? i : Number(i);
                            i++;
                            yield fn(element, n);
                        }
                    });
                };
            } else {
                return function (fn, use_bigint=false) {
                    return extended_iterable_from_generator(function* () {
                        let i = 0n;
                        for (const element of target) {
                            const n = use_bigint ? i : Number(i);
                            i++;
                            yield fn(element, n);
                        }
                    });
                };
            }
        },

        pluck: function (target, async_) {
            if (async_) {
                return function (key) {
                    return async_extended_iterable_from_generator(async function* () {
                        for await (const element of target) {
                            yield element[key];
                        }
                    });
                };
            } else {
                return function (key) {
                    return extended_iterable_from_generator(function* () {
                        for (const element of target) {
                            yield element[key];
                        }
                    });
                };
            }
        },

        enumerate: function (target, async_) {
            if (async_) {
                return function (use_bigint=false) {
                    return async_extended_iterable_from_generator(async function* () {
                        let i = 0n;
                        for await (const element of target) {
                            const n = use_bigint ? i : Number(i);
                            i++;
                            yield [element, n];
                        }
                    });
                };
            } else {
                return function (use_bigint=false) {
                    return extended_iterable_from_generator(function* () {
                        let i = 0n;
                        for (const element of target) {
                            const n = use_bigint ? i : Number(i);
                            i++;
                            yield [element, n];
                        }
                    });
                };
            }
        },

        forEach: 'for_each',
        for_each: function (target, async_) {
            if (async_) {
                return async function (fn, max_iterations=default_max_iterations) {
                    if (max_iterations != Infinity && (!Number.isInteger(max_iterations) || max_iterations < 0)) {
                        throw new TypeError('max_iterations must be a non-negative integer or Infinity');
                    }
                    let i = 0;  // iteration count
                    for await (const value of target) {
                        if (++i > max_iterations) {
                            throw new Error(`max_iterations (${max_iterations}) exceeded`);
                        }
                        fn(value);
                    }
                };
            } else {
                return function (fn, max_iterations=default_max_iterations) {
                    if (max_iterations != Infinity && (!Number.isInteger(max_iterations) || max_iterations < 0)) {
                        throw new TypeError('max_iterations must be a non-negative integer or Infinity');
                    }
                    let i = 0;  // iteration count
                    for (const value of target) {
                        if (++i > max_iterations) {
                            throw new Error(`max_iterations (${max_iterations}) exceeded`);
                        }
                        fn(value);
                    }
                };
            }
        },

        filter: function (target, async_) {
            if (async_) {
                return function (fn) {
                    return async_extended_iterable_from_generator(async function* () {
                        for await (const value of target) {
                            if (fn(value)) {
                                yield value;
                            }
                        }
                    });
                };
            } else {
                return function (fn) {
                    return extended_iterable_from_generator(function* () {
                        for (const value of target) {
                            if (fn(value)) {
                                yield value;
                            }
                        }
                    });
                };
            }
        },

        reduce: function (target, async_) {
            if (async_) {
                return async function (fn, initial_value, max_iterations=default_max_iterations) {
                    if (max_iterations != Infinity && (!Number.isInteger(max_iterations) || max_iterations < 0)) {
                        throw new TypeError('max_iterations must be a non-negative integer or Infinity');
                    }
                    // This implementation diverges from the standard implementation of reduce in
                    // that if initial_value is undefined then it is as if initial_value had not
                    // been specified at all.  The standard implementation will use initial_value
                    // as undefined if it is passed as undefined.
                    if (typeof initial_value === 'undefined') {
                        let i = 0;  // iteration count
                        let acc;
                        for await (const value of target) {
                            const skip_first = (i === 0);
                            if (++i > max_iterations) {
                                throw new Error(`max_iterations (${max_iterations}) exceeded`);
                            }
                            if (skip_first) {
                                acc = value;
                            } else {
                                acc = fn(acc, value);
                            }
                        }
                        return acc;
                    } else {
                        let i = 0;  // iteration count
                        let acc = initial_value;
                        for await (const value of target) {
                            if (++i > max_iterations) {
                                throw new Error(`max_iterations (${max_iterations}) exceeded`);
                            }
                            acc = fn(acc, value);
                        }
                        return acc;
                    }
                };
            } else {
                return function (fn, initial_value, max_iterations=default_max_iterations) {
                    if (max_iterations != Infinity && (!Number.isInteger(max_iterations) || max_iterations < 0)) {
                        throw new TypeError('max_iterations must be a non-negative integer or Infinity');
                    }
                    // This implementation diverges from the standard implementation of reduce in
                    // that if initial_value is undefined then it is as if initial_value had not
                    // been specified at all.  The standard implementation will use initial_value
                    // as undefined if it is passed as undefined.
                    if (typeof initial_value === 'undefined') {
                        let i = 0;  // iteration count
                        let acc;
                        for (const value of target) {
                            const skip_first = (i === 0);
                            if (++i > max_iterations) {
                                throw new Error(`max_iterations (${max_iterations}) exceeded`);
                            }
                            if (skip_first) {
                                acc = value;
                            } else {
                                acc = fn(acc, value);
                            }
                        }
                        return acc;
                    } else {
                        let i = 0;  // iteration count
                        let acc = initial_value;
                        for (const value of target) {
                            if (++i > max_iterations) {
                                throw new Error(`max_iterations (${max_iterations}) exceeded`);
                            }
                            acc = fn(acc, value);
                        }
                        return acc;
                    }
                };
            }
        },

        cycle: function (target, async_) {
            if (async_) {
                return function (n=Infinity) {
                    return async_extended_iterable_from_generator(async function* () {
                        for (let i = 0; i < n; i++) {
                            yield* target;
                        }
                    });
                };
            } else {
                return function (n=Infinity) {
                    return extended_iterable_from_generator(function* () {
                        for (let i = 0; i < n; i++) {
                            yield* target;
                        }
                    });
                };
            }
        },

        nth: function (target, async_) {
            if (async_) {
                return async function (n) {
                    let i = 0;
                    for await (const value of target) {
                        if (i++ >= n) {
                            return value;
                        }
                    }
                    return undefined;  // target too short
                };
            } else {
                return function (n) {
                    let i = 0;
                    for (const value of target) {
                        if (i++ >= n) {
                            return value;
                        }
                    }
                    return undefined;  // target too short
                };
            }
        },

        some: function (target, async_) {
            if (async_) {
                return async function (fn, max_iterations=default_max_iterations) {
                    if (max_iterations != Infinity && (!Number.isInteger(max_iterations) || max_iterations < 0)) {
                        throw new TypeError('max_iterations must be a non-negative integer or Infinity');
                    }
                    let i = 0;  // iteration count
                    for await (const value of target) {
                        if (++i > max_iterations) {
                            throw new Error(`max_iterations (${max_iterations}) exceeded`);
                        }
                        if (fn(value)) {
                            return true;
                        }
                    }
                    return false;
                };
            } else {
                return function (fn, max_iterations=default_max_iterations) {
                    if (max_iterations != Infinity && (!Number.isInteger(max_iterations) || max_iterations < 0)) {
                        throw new TypeError('max_iterations must be a non-negative integer or Infinity');
                    }
                    let i = 0;  // iteration count
                    for (const value of target) {
                        if (++i > max_iterations) {
                            throw new Error(`max_iterations (${max_iterations}) exceeded`);
                        }
                        if (fn(value)) {
                            return true;
                        }
                    }
                    return false;
                };
            }
        },

        every: function (target, async_) {
            if (async_) {
                return async function (fn, max_iterations=default_max_iterations) {
                    if (max_iterations != Infinity && (!Number.isInteger(max_iterations) || max_iterations < 0)) {
                        throw new TypeError('max_iterations must be a non-negative integer or Infinity');
                    }
                    let i = 0;  // iteration count
                    for await (const value of target) {
                        if (++i > max_iterations) {
                            throw new Error(`max_iterations (${max_iterations}) exceeded`);
                        }
                        if (!fn(value)) {
                            return false;
                        }
                    }
                    return true;
                };
            } else {
                return function (fn, max_iterations=default_max_iterations) {
                    if (max_iterations != Infinity && (!Number.isInteger(max_iterations) || max_iterations < 0)) {
                        throw new TypeError('max_iterations must be a non-negative integer or Infinity');
                    }
                    let i = 0;  // iteration count
                    for (const value of target) {
                        if (++i > max_iterations) {
                            throw new Error(`max_iterations (${max_iterations}) exceeded`);
                        }
                        if (!fn(value)) {
                            return false;
                        }
                    }
                    return true;
                };
            }
        },

        join: function (target, async_) {
            if (async_) {
                return async function (separator, max_iterations=default_max_iterations) {
                    return (await expand_async_iterable_bounded(target, max_iterations)).join(separator);
                };
            } else {
                return function (separator, max_iterations=default_max_iterations) {
                    return expand_iterable_bounded(target, max_iterations).join(separator);
                };
            }
        },

        flat: function (target, async_) {
            if (async_) {
                return function (depth=1) {
                    return iterable_extension(flatten_async_iterable(target, depth));
                };
            } else {
                return function (depth=1) {
                    return iterable_extension(flatten_iterable(target, depth));
                };
            }
        },

        // flat_async() uses flatten_async_iterable() regardless of whether target is sync or async
        flat_async: function (target, async_) {
            return function (depth=1) {
                return iterable_extension(flatten_async_iterable(target, depth));
            };
        },

        flatMap: 'flat_map',
        flat_map: function (target, async_) {
            return function (fn) {
                return iterable_extension(target).map(fn).flat(1);
            };
        },

        find: function (target, async_) {
            return function (fn) {
                return iterable_extension(target).filter(fn).nth(0);
            };
        },

        chunk: function (target, async_) {
            if (async_) {
                return function (n) {
                    return async_extended_iterable_from_generator(async function* () {
                        const iterator = target[Symbol.asyncIterator]();
                        while (true) {
                            const ch = await async_iterator_take_chunk(iterator, n);
                            if (ch.length <= 0) {
                                return;  // done
                            }
                            yield ch;
                        }
                    });
                };
            } else {
                return function (n) {
                    return extended_iterable_from_generator(function* () {
                        const iterator = target[Symbol.iterator]();
                        while (true) {
                            const ch = iterator_take_chunk(iterator, n);
                            if (ch.length <= 0) {
                                return;  // done
                            }
                            yield ch;
                        }
                    });
                };
            }
        },

        tap: function (target, async_) {
            if (async_) {
                return function (fn) {
                    return async_extended_iterable_from_generator(async function* () {
                        for await (const element of target) {
                            fn(element);
                            yield element;
                        }
                    });
                };
            } else {
                return function (fn) {
                    return extended_iterable_from_generator(function* () {
                        for (const element of target) {
                            fn(element);
                            yield element;
                        }
                    });
                };
            }
        },

        // tee() returns an array of n iterables which mimic this target iterable.
        // However, these returned iterables are one-shot in the sense that getting
        // a new iterator from them just continues with the iterator state as it
        // was before, and does not start over.
        tee: function (target, async_) {
            // Implementation note: for async iterables, the "values" returned are
            // promises whereas, for sync iterables, the values returned are actual
            // values.
            // Also note: in the async version, errors in creating the promise
            // also result in errors in the stream....
            const iterator_symbol = async_ ? Symbol.asyncIterator : Symbol.iterator;
            return function (n=2) {
                if (!Number.isInteger(n) || n < 0) {
                    throw new TypeError('n must be a non-negative integer');
                }
                let states = [];
                const main_iterator = target[iterator_symbol]();
                for (let i = 0; i < n; i++) {
                    const state = {
                        pending: [],
                        iterator: iterable_extension({
                            [iterator_symbol]() {
                                return {
                                    next() {
                                        if (state.pending.length <= 0) {
                                            try {
                                                const ival = main_iterator.next();
                                                // put the new value in each state's pending queue
                                                for (const s of states) {
                                                    s.pending.push({ value: ival });
                                                }
                                            } catch (err) {
                                                for (const s of states) {
                                                    s.pending.push({ error: err });
                                                }
                                            }
                                        }
                                        const pending_state = state.pending.shift();
                                        if (pending_state.error) {
                                            throw pending_state.error;
                                        } else {
                                            return pending_state.value;
                                        }
                                    },
                                }
                            },
                        }),
                    };
                    states.push(state);
                }
                // return an array of the iterators from states
                return states.map(s => s.iterator);
            };
        },

        unzip: function (target, async_) {
            return function (n=2) {
                return iterable_extension(target).tee(n).map((iterable, i) => iterable.pluck(i));
            };
        },

        drop: function (target, async_) {
            if (async_) {
                return function (n) {
                    return async_extended_iterable_from_generator(async function* () {
                        let i = 0;
                        for await (const value of target) {
                            if (i < n) {
                                i++;  // only increment up to n; don't overflow i
                            } else {
                                yield value;
                            }
                        }
                    });
                };
            } else {
                return function (n) {
                    return extended_iterable_from_generator(function* () {
                        let i = 0;
                        for (const value of target) {
                            if (i < n) {
                                i++;  // only increment up to n; don't overflow i
                            } else {
                                yield value;
                            }
                        }
                    });
                };
            }
        },

        dropWhile: 'drop_while',
        drop_while: function (target, async_) {
            if (async_) {
                return function (fn, max_drop_iterations=default_max_iterations) {
                    if (max_drop_iterations != Infinity && (!Number.isInteger(max_drop_iterations) || max_drop_iterations < 0)) {
                        throw new TypeError('max_drop_iterations must be a non-negative integer or Infinity');
                    }
                    return async_extended_iterable_from_generator(async function* () {
                        let start = false;
                        let i = 0;  // iteration count
                        for await (const value of target) {
                            if (!start && !fn(value)) {
                                start = true;
                            }
                            if (!start && ++i > max_drop_iterations) {
                                throw new Error(`max_drop_iterations (${max_drop_iterations}) exceeded`);
                            }
                            if (start) {
                                yield value;
                            }
                        }
                    });
                };
            } else {
                return function (fn, max_drop_iterations=default_max_iterations) {
                    if (max_drop_iterations != Infinity && (!Number.isInteger(max_drop_iterations) || max_drop_iterations < 0)) {
                        throw new TypeError('max_drop_iterations must be a non-negative integer or Infinity');
                    }
                    return extended_iterable_from_generator(function* () {
                        let start = false;
                        let i = 0;  // iteration count
                        for (const value of target) {
                            if (!start && !fn(value)) {
                                start = true;
                            }
                            if (!start && ++i > max_drop_iterations) {
                                throw new Error(`max_drop_iterations (${max_drop_iterations}) exceeded`);
                            }
                            if (start) {
                                yield value;
                            }
                        }
                    });
                };
            }
        },

        take: function (target, async_) {
            if (async_) {
                return function (n) {
                    return async_extended_iterable_from_generator(async function* () {
                        let i = 0;
                        for await (const value of target) {
                            if (i++ < n) {
                                yield value;
                            } else {
                                return;
                            }
                        }
                    });
                };
            } else {
                return function (n) {
                    return extended_iterable_from_generator(function* () {
                        let i = 0;
                        for (const value of target) {
                            if (i++ < n) {
                                yield value;
                            } else {
                                return;
                            }
                        }
                    });
                };
            }
        },

        takeWhile: 'take_while',
        take_while: function (target, async_) {
            if (async_) {
                return function (fn) {
                    return async_extended_iterable_from_generator(async function* () {
                        for await (const value of target) {
                            if (fn(value)) {
                                yield value;
                            } else {
                                return;
                            }
                        }
                    });
                };
            } else {
                return function (fn) {
                    return extended_iterable_from_generator(function* () {
                        for (const value of target) {
                            if (fn(value)) {
                                yield value;
                            } else {
                                return;
                            }
                        }
                    });
                };
            }
        },

        toArray: 'to_array',
        to_array: function (target, async_) {
            if (async_) {
                return async function (max_iterations=default_max_iterations) {
                    if (max_iterations != Infinity && (!Number.isInteger(max_iterations) || max_iterations < 0)) {
                        throw new TypeError('max_iterations must be a non-negative integer or Infinity');
                    }
                    let i = 0;  // iteration count
                    const array = [];
                    for await (const value of target) {
                        if (++i > max_iterations) {
                            throw new Error(`max_iterations (${max_iterations}) exceeded`);
                        }
                        array.push(value);
                    }
                    return array;
                };
            } else {
                return function (max_iterations=default_max_iterations) {
                    if (max_iterations != Infinity && (!Number.isInteger(max_iterations) || max_iterations < 0)) {
                        throw new TypeError('max_iterations must be a non-negative integer or Infinity');
                    }
                    let i = 0;  // iteration count
                    const array = [];
                    for (const value of target) {
                        if (++i > max_iterations) {
                            throw new Error(`max_iterations (${max_iterations}) exceeded`);
                        }
                        array.push(value);
                    }
                    return array;
                };
            }
        },

        unique: function (target, async_) {
            if (async_) {
                return function (max_unique_values=Infinity) {
                    return async_extended_iterable_from_generator(async function* () {
                        if (max_unique_values != Infinity && (!Number.isInteger(max_unique_values) || max_unique_values < 0)) {
                            throw new TypeError('max_unique_values must be a non-negative integer or Infinity');
                        }
                        const already_seen = new Set();
                        for await (const value of target) {
                            if (!already_seen.has(value)) {
                                if (already_seen.size >= max_unique_values) {
                                    throw new Error(`max_unique_values (${max_unique_values}) exceeded`);
                                }
                                already_seen.add(value);
                                yield value;
                            }
                        }
                    });
                };
            } else {
                return function (max_unique_values=Infinity) {
                    return extended_iterable_from_generator(function* () {
                        if (max_unique_values != Infinity && (!Number.isInteger(max_unique_values) || max_unique_values < 0)) {
                            throw new TypeError('max_unique_values must be a non-negative integer or Infinity');
                        }
                        const already_seen = new Set();
                        for (const value of target) {
                            if (!already_seen.has(value)) {
                                if (already_seen.size >= max_unique_values) {
                                    throw new Error(`max_unique_values (${max_unique_values}) exceeded`);
                                }
                                already_seen.add(value);
                                yield value;
                            }
                        }
                    });
                };
            }
        },

        // marble diagram:
        // | --1---2-----3--4-----X
        // |         replace_error( (err) => --10--| )
        // | --1---2-----3--4--------10--|
        replaceError: 'replace_error',
        replace_error: function (target, async_) {
            if (async_) {
                return function (create_replacement) {
                    return async_extended_iterable_from_generator(async function* () {
                        try {
                            yield* target;
                        } catch (err) {
                            yield* create_replacement(err);
                        }
                    });
                }
            } else {
                return undefined;  // not supported for sync iterators
            }
        },

        // marble diagram:
        // | --1----2-----3--------4--- (target)
        // | ----a-----b-----c--d------ (other)
        // |         sample_combine(...others)
        // | -------2a----3b-------4d--
        sampleCombine: 'sample_combine',
        sample_combine: function (target, async_) {
            if (async_) {
                return function (...iterables) {
                    return async_extended_iterable_from_generator(async function* () {
                        let   combined_values;
                        let   combine_done = false;
                        let   combine_error;  // will be set by combine_promise catch handler if an error occurs
                        const combine_iterator = combine_async(...iterables)[Symbol.asyncIterator]();
                        let   combine_promise = combine_iterator.next().then(result => {
                            if (!combine_done) {
                                if (result.done) {
                                    combine_done = true;
                                    combine_promise = undefined;  // clear promise, no longer needed
                                } else {
                                    combined_values = result.value;
                                }
                            }
                        }).catch(err => {
                            combine_error = err;
                            combine_promise = undefined;  // clear promise, no longer needed
                        });
                        for await (const element of target) {
                            if (combined_values) {
                                yield [ element, ...combined_values ];
                            } else {
                                if (combine_done) {
                                    // there is currently no combined_values,
                                    // and there will not be any in the future
                                    break;
                                }
                            }
                            if (combine_error) {
                                throw error;
                            }
                        }
                    });
                }
            } else {
                return function (...iterables) {
                    return extended_iterable_from_generator(function* () {
                        const target_iterator   = target[Symbol.iterator]();
                        const combined_iterator = combine(...iterables)[Symbol.iterator]();
                        let   combined_values;
                        while (true) {
                            const target_next = target_iterator.next();
                            if (target_next.done) {
                                break;
                            }
                            const combined_next = combined_iterator.next();
                            if (combined_next.done) {
                                if (!combined_values) {
                                    // there is currently no combined_values,
                                    // and there will not be any in the future
                                    break;
                                }
                            } else {
                                combined_values = combined_next.value;
                            }
                            // note: here, combined_values has a value
                            yield [ target_next.value, ...combined_values ];
                        }
                    });
                }
            }
        },
    };

    // replace aliases in iterable_extension_handler_functions:
    for (const key in iterable_extension_handler_functions) {
        const value = iterable_extension_handler_functions[key];
        if (['string', 'symbol'].includes(typeof value)) {
            iterable_extension_handler_functions[key] = iterable_extension_handler_functions[value];
        }
    }

    const iterable_extension_handler_functions_keys = Object.keys(iterable_extension_handler_functions);


    // Flatten a sync iterable to a given depth.
    // The result is a new iterable, but is not wrapped with iterable_extension(),
    // and once exhausted, cannot be restarted.  This sync version will treat
    // any contained async iterables it encounters as a single value, i.e.,
    // those async iterables will not be expanded.
    function* flatten_iterable(iterable, depth=1) {
        if (!is_iterable_like(iterable)) {
            throw new TypeError('first argument must be an iterable object');
        }
        if (!Number.isInteger(depth) || depth < 0) {
            throw new TypeError('depth must be a non-negative integer');
        }
        if (depth <= 0) {
            yield iterable;
        } else {
            for (const value of iterable) {
                if (is_iterable_like(value)) {
                    yield* flatten_iterable(value, depth-1);
                } else {
                    yield value;
                }
            }
        }
    }
    // Flatten an iterable (sync or async) to a given depth.
    // The result is a new iterable, but is not wrapped with iterable_extension(),
    // and once exhausted, cannot be restarted.  This async version will expand
    // contained iterables, sync or async.
    async function* flatten_async_iterable(iterable, depth=1) {
        const supports_sync  = is_iterable_like(iterable);
        const supports_async = is_async_iterable_like(iterable);
        if (!supports_sync && !supports_async) {
            throw new TypeError('argument must be an iterable object');
        }
        if (supports_sync && supports_async) {
            throw new TypeError('argument must be sync or async iterable but not both');
        }
        if (!Number.isInteger(depth) || depth < 0) {
            throw new TypeError('depth must be a non-negative integer');
        }
        if (depth <= 0) {
            yield iterable;
        } else {
            if (supports_sync) {
                for (const value of iterable) {
                    if (is_iterable_like(value) || is_async_iterable_like(value)) {
                        yield* flatten_async_iterable(value, depth-1);
                    } else {
                        yield value;
                    }
                }
            } else {  // supports_async
                for await (const value of iterable) {
                    if (is_iterable_like(value) || is_async_iterable_like(value)) {
                        yield* flatten_async_iterable(value, depth-1);
                    } else {
                        yield value;
                    }
                }
            }
        }
    }

    // expand_iterable_bounded() expands an iterable,
    // permitting only a bounded number of expansions.
    function expand_iterable_bounded(iterable, max_iterations=default_max_iterations) {
        if (!is_iterable_like(iterable)) {
            throw new TypeError('first argument must be an iterable object');
        }
        if (max_iterations != Infinity && (!Number.isInteger(max_iterations) || max_iterations < 0)) {
            throw new TypeError('max_iterations must be a non-negative integer or Infinity');
        }
        const values = [];
        let iterator = iterable[Symbol.iterator]();
        for (let i = 0; i <= max_iterations; i++) {  // (one extra loop for done)
            const r = iterator.next();
            if (r.done) {
                return values;
            } else {
                values.push(r.value);
            }
        }
        throw new Error(`max_iterations (${max_iterations}) exceeded`);
    }
    async function expand_async_iterable_bounded(iterable, max_iterations=default_max_iterations) {
        if (!is_async_iterable_like(iterable)) {
            throw new TypeError('first argument must be an iterable object');
        }
        if (max_iterations != Infinity && (!Number.isInteger(max_iterations) || max_iterations < 0)) {
            throw new TypeError('max_iterations must be a non-negative integer or Infinity');
        }
        const values = [];
        let iterator = iterable[Symbol.asyncIterator]();
        for (let i = 0; i <= max_iterations; i++) {  // (one extra loop for done)
            const r = await iterator.next();
            if (r.done) {
                return values;
            } else {
                values.push(r.value);
            }
        }
        throw new Error(`max_iterations (${max_iterations}) exceeded`);
    }

    // Chain a number of iterables together, returning a new iterable.
    // The returned iterable is wrapped with iterable_extension().
    function chain(...iterables) {
        return extended_iterable_from_generator(function* () {
            for (const it of iterables) {
                yield* it;
            }
        });
    }
    function chain_async(...iterables) {
        return async_extended_iterable_from_generator(async function* () {
            for (const it of iterables) {
                yield* it;
            }
        });
    }

    // Repeat the given thing n times, as a new iterable.
    // The returned iterable is wrapped with iterable_extension().
    function repeat(thing, n=Infinity) {
        return extended_iterable_from_generator(function* () {
            for (let i = 0; i < n; i++) {
                yield thing;
            }
        });
    }
    function repeat_async(thing, n=Infinity) {
        return async_extended_iterable_from_generator(async function* () {
            for (let i = 0; i < n; i++) {
                yield thing;
            }
        });
    }

    // Return an array of the first n elements from the iterator.
    // Note that this operates on an iterator, not an iterable.
    function iterator_take_chunk(iterator, n) {
        const chunk = [];
        for (let i = 0; i < n; i++) {
            const r = iterator.next();
            if (r.done) {
                break;
            } else {
                chunk.push(r.value);
            }
        }
        return chunk;
    }
    async function async_iterator_take_chunk(iterator, n) {
        const chunk = [];
        for (let i = 0; i < n; i++) {
            const r = await iterator.next();
            if (r.done) {
                break;
            } else {
                chunk.push(r.value);
            }
        }
        return chunk;
    }

    // "Zip" the iterables producing a new iterable of arrays of values from each iterable.
    // The returned iterable is wrapped with iterable_extension().
    // zip() stops after the shortest iterable is exhausted.
    // zip_longest() continues until all iterables are exhausted,
    // substituting undefined for values of earlier-exhausted iterables.
    function zip(...iterables) {
        return extended_iterable_from_generator(function* () {
            if (iterables.length > 0) {
                const iterators = iterables.map(iterable => iterable[Symbol.iterator]());
                while (true) {
                    const results = iterators.map(it => it.next());
                    if (results.some(r => r.done)) {
                        break;
                    }
                    yield results.map(r => (r.done ? undefined : r.value));
                }
            }
        });
    }
    function zip_async(...iterables) {
        return async_extended_iterable_from_generator(async function* () {
            if (iterables.length > 0) {
                const iterators = iterables.map(iterable => iterable[Symbol.asyncIterator]());
                while (true) {
                    const results = await Promise.all(iterators.map(it => it.next()));
                    if (results.some(r => r.done)) {
                        break;
                    }
                    yield results.map(r => (r.done ? undefined : r.value));
                }
            }
        });
    }
    function zip_longest(...iterables) {
        return extended_iterable_from_generator(function* () {
            if (iterables.length > 0) {
                const iterators = iterables.map(iterable => iterable[Symbol.iterator]());
                while (true) {
                    const results = iterators.map(it => it.next());
                    if (results.every(r => r.done)) {
                        break;
                    }
                    yield results.map(r => (r.done ? undefined : r.value));
                }
            }
        });
    }
    function zip_longest_async(...iterables) {
        return async_extended_iterable_from_generator(async function* () {
            if (iterables.length > 0) {
                const iterators = iterables.map(iterable => iterable[Symbol.asyncIterator]());
                while (true) {
                    const results = await Promise.all(iterators.map(it => it.next()));
                    if (results.every(r => r.done)) {
                        break;
                    }
                    yield results.map(r => (r.done ? undefined : r.value));
                }
            }
        });
    }

    const zipLongest = zip_longest;

    const combine = zip;
    const combine_longest = zip_longest;

    // marble diagram:
    // | --1----2-----3--------4---
    // | ----a-----b-----c--d------
    // |         combine_async
    // | ----1a-2a-2b-3b-3c-3d-4d--
    function combine_async(...iterables) {
        return async_extended_iterable_from_generator(async function* () {
            if (iterables.length > 0) {
                const iterators = iterables.map(iterable => iterable[Symbol.asyncIterator]());
                const promises  = new Array(iterators.length).fill();
                const results   = new Array(iterators.length).fill();  // resolved promise results (including done)
                const values    = new Array(iterators.length).fill();  // non-done result values
                let   error;  // will be set by promise catch handler if an error occurs
                function set_promise(index) {
                    promises[index] = iterators[index].next().then(result => {
                        results[index] = result;
                        if (result.done) {
                            promises[index] = undefined;  // clear promise, no longer needed
                        } else {
                            values[index] = result.value;
                            set_promise(index);  // set promise for iterator next value
                        }
                        return result;
                    }).catch(err => {
                        error = err;
                        promises[index] = undefined;  // clear promise, no longer needed
                    });
                }
                // set the initial promises
                for (const index in iterators) {
                    set_promise(index);
                }
                // loop to yield the results
                while (true) {
                    const pending_promises = promises.filter(p => p);
                    if (pending_promises.length <= 0) {
                        break;
                    }
                    await Promise.race(pending_promises);  // may throw an error
                    if (results.every(result => !!result)) {
                        // yield only after all iterators have produced a result
                        yield [ ...values ];
                    }
                    if (error) {
                        throw error;
                    }
                }
            }
        });
    }

    // marble diagram:
    // | --1----2-----3--------4---
    // | ----a-----b----c---d------
    // |         merge
    // | --1-a--2--b--3-c---d--4---
    function merge(...iterables) {
        return extended_iterable_from_generator(function* () {
            if (iterables.length > 0) {
                const iterators = iterables.map(iterable => iterable[Symbol.iterator]());
                const done      = new Array(iterators.length).fill();
                // loop to yield the results
                while (true) {
                    if (done.every(d => d)) {
                        break;
                    }
                    for (const i in iterators) {
                        if (!done[i]) {
                            const ival = iterators[i].next();
                            if (ival.done) {
                                done[i] = true;
                            } else {
                                yield ival.value;
                            }
                        }
                    }
                }
            }
        });
    }

    // marble diagram:
    // | --1----2-----3--------4---
    // | ----a-----b----c---d------
    // |         merge_async
    // | --1-a--2--b--3-c---d--4---
    function merge_async(...iterables) {
        return async_extended_iterable_from_generator(async function* () {
            if (iterables.length > 0) {
                const iterators = iterables.map(iterable => iterable[Symbol.asyncIterator]());
                const promises  = new Array(iterators.length).fill();
                let   error;  // will be set by promise catch handler if an error occurs
                function set_promise(index) {
                    promises[index] = iterators[index].next().then(result => {
                        if (result.done) {
                            promises[index] = undefined;  // clear promise, no longer needed
                        } else {
                            set_promise(index);  // set new promise for iterator next value
                        }
                        return result;
                    }).catch(err => {
                        error = err;
                        promises[index] = undefined;  // clear promise, no longer needed
                    });
                }
                // set the initial promises
                for (const index in iterators) {
                    set_promise(index);
                }
                // loop to yield the results
                while (true) {
                    const pending_promises = promises.filter(p => p);
                    if (pending_promises.length <= 0) {
                        break;
                    }
                    const result = await Promise.race(pending_promises);  // may throw an error
                    if (!result.done) {
                        yield result.value;
                    }
                    if (error) {
                        throw error;
                    }
                }
            }
        });
    }


    // === ASYNC UTILITIES ===

    // Return a promise that settles after ms milliseconds returning
    // the (optional) result.
    async function delay_ms(ms, result) {
        return new Promise(resolve => setTimeout(resolve, ms, result));
    }

    // Given a sync iterable, return an async extended iterable for which each
    // successive element of the input iterable becomes available after a
    // delay (inter_element_delay milliseconds) after next() is called.
    function asyncify_iterable(iterable, inter_element_delay=1000) {
        if (!is_iterable_like(iterable)) {
            throw new TypeError('iterable object expected');
        }
        if (!Number.isInteger(inter_element_delay) || inter_element_delay < 0) {
            throw new TypeError('inter_element_delay must be a non-negative integer');
        }
        const iterator_creator = iterable[Symbol.iterator].bind(iterable);
        return iterable_extension({
            [Symbol.asyncIterator]() {
                const iterator = iterator_creator();
                return {
                    async next() {
                        return new Promise(resolve => {
                            const ival = iterator.next();
                            if (ival.done) {
                                resolve(ival);
                            } else {
                                setTimeout(resolve, inter_element_delay, ival);
                            }
                        });
                    },
                };
            },
        });
    }

    // Returns an async extended iterable to which data can be pushed.
    // event_source?: async (push, error) => any
    // max_pending_inputs must be a non-negative integer or Infinity, and
    // (if not Infinity) limits the number of unconsumed inputs from push().
    // event_source, if given, will be called with two arguments (which are
    // functions), "push" and "error".  The push function accepts normal
    // { value, done } objects as returned by iterators.
    // The error function accepts a single "reason" argument and causes abnormal
    // termination of the iterator (an error is thrown).  The error function can
    // be called with no arguments, in which case a generic reason will be
    // substituted.  An alternative to calling error() is to simply throw an
    // error from the event_source function.  This is equivalent to calling
    // error() with the thrown error.
    // New push and error functions are passed each time the function returned
    // as the value of the asyncIterator property is called to create a new
    // iterator.  Therefore, dependent listeners can be removed based on their
    // values without affecting other listeners.
    function asyncify_event_source(event_source, max_pending_inputs=Infinity) {
        if (max_pending_inputs != Infinity && (!Number.isInteger(max_pending_inputs) || max_pending_inputs < 0)) {
            throw new TypeError('max_pending_inputs must be a non-negative integer or Infinity');
        }
        return iterable_extension({
            [Symbol.asyncIterator]() {
                const pending_inputs  = [];  // unemitted values received from push()
                const waiting_outputs = [];  // unsettled promises emitted from next()
                let   done_promise;          // will be set to final "done" promise (either resolved or rejected)
                // - pending_inputs entries are the values recieved from push() that
                //   have not yet been consumed by next().
                // - waiting_outputs entries are { promise, resolve } pairs and are
                //   created when next() has been called but no value is yet available.
                // - pending_inputs and waiting_outputs are both treated as queues with
                //   entries added to the end and removed from the beginning.
                // - invariant: pending_inputs.length === 0 if waiting_outputs.length > 0
                // - reason: waiting_outputs is extended only when next() is called
                //   but no value is yet available (either in pending_inputs or in
                //   done_promise).  On the other hand, pending_inputs is extended only
                //   when a new value is received from push() and there is not yet any
                //   done_promise and there is no promise in waiting_outputs to receive it.
                // - the first "done" value received is stored in a promise in done_promise.
                // - once a "done" value is received from push(), all other received values
                //   will be ignored, and, once the promise corresponding to the done
                //   value has been emitted from next(), subsequent calls to next() will
                //   receive that same done value promise.
                function push(ival) {
                    if (!done_promise) {  // otherwise, ignore ival if done value already received or error received
                        if (ival.done) {
                            done_promise = Promise.resolve(ival);
                            // resolve any waiting_outputs with this done value
                            while (waiting_outputs.length > 0) {
                                waiting_outputs.shift().resolve(ival);
                            }
                        } else {
                            if (waiting_outputs.length > 0) {
                                waiting_outputs.shift().resolve(ival);
                            } else {
                                if (pending_inputs.length >= max_pending_inputs) {
                                    throw new MaxPendingInputsExceededError(max_pending_inputs);
                                }
                                pending_inputs.push(ival);
                            }
                        }
                    }
                }
                function error(reason) {
                    if (!done_promise) {  // otherwise, ignore
                        reason = (typeof reason !== 'undefined') ? reason : new Error();
                        // note: do not create a new (rejected) promise if we can use
                        // one of the waiting promises, otherwise the promise we create
                        // will cause an unhandled rejection error.
                        done_promise = waiting_outputs[0] ?? Promise.reject(reason);
                        // resolve any waiting_outputs with this done value
                        while (waiting_outputs.length > 0) {
                            waiting_outputs.shift().reject(reason);
                        }
                    }
                }
                if (event_source) {
                    event_source(push, error).catch(error);
                }
                return {
                    // provide push and error functions so that this iterator
                    // can be used as an async FIFO/pipe.
                    push,
                    error,

                    // the standard iterator next() method
                    async next() {
                        if (pending_inputs.length > 0) {
                            return Promise.resolve(pending_inputs.shift());
                        } else if (done_promise) {
                            return done_promise;
                        } else {
                            // no pending_inputs and not yet done
                            let resolve, reject;
                            const promise = new Promise((resolve_fn, reject_fn) => {
                                resolve = resolve_fn;
                                reject  = reject_fn;
                            });
                            const entry = { promise, resolve, reject };
                            waiting_outputs.push(entry);
                            return promise;
                        }
                    },
                };
            },
        });
    }

    class MaxPendingInputsExceededError extends Error {
        constructor(max_pending_inputs) {
            super(`max_pending_inputs exceeded (${max_pending_inputs})`);
        }
    }


    // === EXPORT ===

    facet_export({
        max_range_sources,
        default_max_iterations,
        is_iterable_like,
        is_async_iterable_like,
        range,
        iterable_extension,
        extended_iterable_from_generator,
        async_extended_iterable_from_generator,
        iterable_extension_handler_functions_keys,
        flatten_iterable,
        flatten_async_iterable,
        expand_iterable_bounded,
        expand_async_iterable_bounded,
        chain,
        chain_async,
        repeat,
        repeat_async,
        iterator_take_chunk,
        async_iterator_take_chunk,
        zip,
        zip_async,
        zip_longest,
        zip_longest_async,
        zipLongest,
        combine,
        combine_longest,
        combine_async,
        merge,
        merge_async,
        delay_ms,
        asyncify_iterable,
        asyncify_event_source,
        MaxPendingInputsExceededError,
     });

} catch (err) { facet_load_error(err, current_script); } })(globalThis.core.facet_init());  // facet end

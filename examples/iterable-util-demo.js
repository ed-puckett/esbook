// range() examples

importlib('iterable-util.js').then(iterable_util => {
    const {
        range,
        flatten_iterable,
        iterable_extension,
        expand_iterable_bounded,
        chain,
        repeat,
        max_range_generators,
        default_max_iterations,
        zip,
        zip_longest,
        iterable_extension_handler_functions_keys,
    } = iterable_util;

    println(range(5)[Symbol.iterator]);

    printf('%4j\n', range(5));

    println('-------');
    const it = range(5)[Symbol.iterator]();
    printf('%4j\n', it.next());
    printf('%4j\n', it.next());
    printf('%4j\n', it.next());
    printf('%4j\n', it.next());
    printf('%4j\n', it.next());
    printf('%4j\n', it.next());
    printf('%4j\n', it.next());

    println('-------');
    it.reset(-10);
    printf('%4j\n', it.next());
    printf('%4j\n', it.next());
    printf('%4j\n', it.next());
    printf('%4j\n', it.next());
    printf('%4j\n', it.next());
    printf('%4j\n', it.next());
    printf('%4j\n', it.next());
    printf('%4j\n', it.next());
    printf('%4j\n', it.next());
    printf('%4j\n', it.next());
    printf('%4j\n', it.next());
    printf('%4j\n', it.next());
    printf('%4j\n', it.next());
    printf('%4j\n', it.next());
    printf('%4j\n', it.next());
    printf('%4j\n', it.next());
    printf('%4j\n', it.next());

    println('-------');
    it.reset();
    printf('%4j\n', it.next());
    printf('%4j\n', it.next());
    printf('%4j\n', it.next());
    printf('%4j\n', it.next());
    printf('%4j\n', it.next());
    printf('%4j\n', it.next());
    printf('%4j\n', it.next());

    println('-------');
    let r = range(7, 11, { inclusive: true });
    println([...r]);
    println([...r]);

    println('-------');
    r = range(7.5, 11.5, { increment: 0.5 });
    println([...r]);
    println([...r]);

    println('-------');
    r = range(7.5, 11.5, { increment: 0.5, inclusive: true });
    println([...r]);
    println([...r]);

    println('-------');
    r = range([['a', 'b', 'c'], ['p', 'q'], ['x', 'y']]);
    printf('%4j\n', [...r]);

    println('-------');
    r = range(['abc', 'mn', 'pq']);
    printf('%4j\n', [...r]);
    println('again');
    printf('%4j\n', [...r]);
    println([...r].map(l => l.join('')).join(' '));
    println([...r].map(l => l.join('')).join(' '));

    println('-------');
    r = range([
        'ab',
        (function* () { let i = 0; while (true) yield i++; })(),
        'xyz',
    ]);
    let pass = 0;
    for (const value of r) {
        printf(`${pass>0 ? ' ' : ''}%s`, value.join());
        if (++pass >= 200) break;
    }
    println();
    println();

    println('-------');
    r = range([
        'ab',
        (function* () { let i = 0; while (true) yield i++; })(),
        'xyz',
    ], true);
    pass = 0;
    for (const value of r) {
        printf(`${pass>0 ? ' ' : ''}%s`, value.join());
        if (++pass >= 300) break;
    }
    println();
    println();

    println('-------');
    r = range(['ab', 'pqr', 'xyz'], true);
    println([ ...r ].map(l => l.join('')).join(' '));
    println();

    println('-------');
    r = range(['ab', 'pqr', '', 'xyz'], true);
    println([ ...r ].map(l => l.join()).join(' '));
    println();

    println('-------');
    r = range(1, 10, true);
    println([ ...r ]);
    println();

    println('-------');
    r = range(1, 10);
    println([ ...r ]);
    println();

    println('-------');
    println([ ...range(5).map(x => x**2).map(x => x+1) ]);
    println();

    println('-------');
    r = range(['abc', 'pqr', 'xyz'], true);
    println(r.map(l => l.join('')).join(' '));
    println();

    println('-------');
    r = range([
        'a', range(['f', range(['j', range(['p', range(['x']) ]) ]) ]),
        'b', range(['g', 'h' ]),
        ]);
    println(JSON.stringify([ ...r.flat(0) ]));
    println(JSON.stringify([ ...r.flat(1) ]));
    println(JSON.stringify([ ...r.flat(2) ]));
    println(JSON.stringify([ ...r.flat(3) ]));
    println(JSON.stringify([ ...r.flat(4) ]));
    println(JSON.stringify([ ...r.flat(5) ]));
    println();

    println('-------');
    r = range(10);
    println(r.join('-'));
    println();

    println('-------');
    r = range(default_max_iterations);
    println(r.reduce((acc, v) => acc+v));
    println();

    println('-------');
    r = range(30);
    println(r.join('-'));
    println(r.map(x => x+1).map(x => x**2).join('-'));
    println();

    println('-------');
    println([ ...chain(range(5), range(7, 9), range(10, 12)).map(x => 100+x) ]);
    println();

    println('-------');
    println([ ...range(5).chain(range(7, 9), range(10, 12)).map(x => 100+x) ]);
    println();

    println('-------');
    println(JSON.stringify([ ...range(15).chunk(4).map(x => x.join('|')) ]));
    println();

    println('-------');
    println(JSON.stringify([ ...range(15).take(4) ]));
    println(JSON.stringify([ ...range(15).take_while(x => (x < 10)) ]));
    println();

    println('-------');
    println(JSON.stringify([ ...range(15).drop(4) ]));
    println(JSON.stringify([ ...range(15).drop_while(x => (x < 10)) ]));
    println();

    println('-------');
    println(JSON.stringify([ ...range(15).filter(x => (x & 1)).map(x => `>>>${x}<<<`) ]));
    println();

    println('-------');
    range(15).for_each(x => println(`==> ${x}`));
    println();

    println('-------');
    println(JSON.stringify([ ...zip(range(15), range(100, 110), range(200, 207)) ]));
    println(JSON.stringify([ ...zip_longest(range(15), range(100, 110), range(200, 207)) ]));
    println();

    println('-------');
    println(range(10, 13).reduce((acc, v) => acc+v));
    println(range(10, 13).reduce((acc, v) => acc+v, 100));
    println();

    println('-------');
    println(range(15).some(x => x<10));   // true
    println(range(15).some(x => x>15));   // false
    println(range(15).every(x => x<10));  // false
    println(range(15).every(x => x<15));  // true
    println();

    println('-------');
    println(JSON.stringify([ ...range(['ab', 'xy']).map(e => e.join('')).enumerate() ]));
    println();

    println('-------');
    println(JSON.stringify([ ...range(5).map(x => ({ value: `k${x}` })) ]));
    println(JSON.stringify([ ...range(5).map(x => ({ value: `k${x}` })).pluck('value') ]));
    println();

    println('-------');
    println(range(5).tap(println).reduce((acc, v) => acc+v));
    println();

    println('-------');
    println(JSON.stringify(range(5)));
    println(JSON.stringify(range(5).to_array()));
    println();

    println('-------');
    function make_sequence_with_duplicates() {
        return chain(
            zip(range(5), range(5), range(5)).flat(1),
            range([[Math.log]]).flat(1),
            range(100, 105),
            [Math.log],
            zip(range(6), range(6), range(6)).flat(1)
        );
    }
    println(JSON.stringify(make_sequence_with_duplicates().to_array()));
    println(make_sequence_with_duplicates().map(x => x.toString()).join());
    println(make_sequence_with_duplicates().unique().map(x => x.toString()).join());
    println();

    println('-------');
    println(JSON.stringify(range(5).map(x => x&1 ? [x, 2*x] : []).to_array()));
    println(JSON.stringify(range(5).flat_map(x => x&1 ? [x, 2*x] : []).to_array()));
    println();

    println('-------');
    println(JSON.stringify(range(5).map(x => ({ a: x, b: 2*x })).to_array()));
    println(JSON.stringify(range(5).map(x => ({ a: x, b: 2*x })).find(o => (o.b === 4))));
    println(`${range(5).map(x => ({ a: x, b: 2*x })).find(o => (o.b === 5))}`);
    println();

    println('-------');
    println(JSON.stringify(range(0, 5, 0.5).to_array()));
    println();

    println('-------');
    r = range(1, 10, true).map(Math.log).chunk(3);
    println(JSON.stringify(r.to_array()));
    println(JSON.stringify(r.to_array()));
    println(JSON.stringify(r.to_array()));

    println('-------');
    const [r1, r2, r3] = range(5).map(x => x**2).map(x => x+1).tee(3);
    printf('r1: %j\n', r1.to_array());
    printf('r2: %j\n', r2.to_array());
    printf('r3: %j\n', r3.to_array());
    printf();

    println('-------');
    const z = zip(range(5), range(10, 15), range(20, 25));
    printf('z: %j\n', z.to_array());
    const [i1, i2, i3] = z.unzip(3);
    printf('i1: %j\n', i1.to_array());
    printf('i2: %j\n', i2.to_array());
    printf('i3: %j\n', i3.to_array());
    printf();

    println('-------');
    println(JSON.stringify(iterable_extension_handler_functions_keys, null, 4));
    println();

});

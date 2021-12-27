'use strict';

(async ({ current_script, facet, facet_export, facet_load_error }) => { try {  // facet begin

    // Cellular Automata

    class CellularAutomaton {
        constructor(transitions, cell_value_count=1, input_radius=1) {
            if (!Number.isInteger(cell_value_count) || cell_value_count < 2 || cell_value_count > 256) {
                throw new Error('cell_value_count must be an integer from 2 to 256');
            }
            if (!Number.isInteger(input_radius) || input_radius < 0) {
                throw new Error('input_radius must be a non-negative integer');
            }

            const {
                input_width,
                input_space,
            } = this.constructor.stats(cell_value_count, input_radius);

            const ta = new Uint8Array(new ArrayBuffer(input_space));
            const input_index_seen = new Array(input_space);  // for duplicate detection

            function throw_transitions_format_error(specific_message) {
                throw new Error(`transitions format error: ${specific_message}`);
            }
            if (!Array.isArray(transitions)) {
                throw_transitions_format_error('transitions must be an array');
            }
            for (const window_value of transitions) {
                if (!Array.isArray(window_value) || window_value.length !== 2) {
                    throw_transitions_format_error('transitions must be an array of [window, value] elements');
                }
                const [ window, value ] = window_value;
                if (!Array.isArray(window) || window.length !== input_width) {
                    throw_transitions_format_error(`transitions must be an array of [window, value] elements, and window must be an array of ${input_width} valid cell values`);
                }
                if (!Number.isInteger(value) || value < 0 || value >= cell_value_count) {
                    throw_transitions_format_error('invalid cell value');
                }
                let input_index = 0;
                for (let i = input_width; (i -= 1) >= 0; ) {
                    const v = window[i];
                    if (!Number.isInteger(v) || v < 0 || v >= cell_value_count) {
                        throw_transitions_format_error('invalid cell value');
                    }
                    input_index = (cell_value_count*input_index) + v;
                }
                if (input_index_seen[input_index]) {
                    throw_transitions_format_error(`duplicate window: [${window}]`);
                }
                input_index_seen[input_index] = true;
                ta[input_index] = value;
            }

            this._ta               = ta;
            this._cell_value_count = cell_value_count;
            this._input_radius     = input_radius;
            this._input_width      = input_width;
            this._input_space      = input_space;
        }

        get ta               (){ return this._ta; }
        get cell_value_count (){ return this._cell_value_count; }
        get input_radius     (){ return this._input_radius; }
        get input_width      (){ return this._input_width; }
        get input_space      (){ return this._input_space; }

        static stats(cell_value_count, input_radius) {
            const input_width = 2*input_radius + 1;             // cell width of "attention focus"
            const input_space = cell_value_count**input_width;  // count of distinct inputs
            return {
                cell_value_count,
                input_radius,
                input_width,
                input_space,
            };
        }

        create_row(width) {
            if (!Number.isInteger(width) || width <= 0) {
                throw new Error('width must be a positive integer');
            }
            const row = new Array(width);
            for (let i = 0; i < width; i++) {
                row[i] = 0;
            }
            return row;
        }

        generate(row) {
            const width = row.length;
            const new_row = this.create_row(width);
            for (let pos = 0; pos < width; pos++) {
                let input_value = 0;
                // handle the entire row in a little-endian manner, i.e.,
                // from least-to-most significant values
                for (let i = pos+this.input_radius; i >= pos-this.input_radius; i--) {
                    input_value = (this.cell_value_count*input_value) + (row[i] ?? 0);
                }
                new_row[pos] = this.ta[input_value];
            }
            return new_row;
        }
    }

    class ECA extends CellularAutomaton {
        constructor(n) {
            super(ECA._n_to_transitions(n), 2, 1);
        }

        static _n_to_transitions(n) {
            if (!Number.isInteger(n) || n < 0 || n > 255) {
                throw new Error('n must be an integer from 0 to 255');
            }
            const windows = [
                [0,0,0],  // 0b000
                [0,0,1],  // 0b001
                [0,1,0],  // 0b010
                [0,1,1],  // 0b011
                [1,0,0],  // 0b100
                [1,0,1],  // 0b101
                [1,1,0],  // 0b110
                [1,1,1],  // 0b111
            ];
            const transitions = [];
            for (let i = 0; i < 8; i++) {
                const value = n & 1;
                transitions.push([windows[i], value]);
                n = n >>> 1;
            }
            return transitions;
        }
    }

    // options?: {
    //     cell_width?:        number,  // default value: 1
    //     cell_height?:       number,  // default value: 1
    //     cell_border_width?: number,  // default value: 0
    //     cell_border_color?: string,  // default value: '#ffff0080'
    // }
    class CellularAutomatonRenderer {
        constructor(ca, colors, options) {
            if (! (ca instanceof CellularAutomaton)) {
                throw new TypeError('ca must be an instance of CellularAutomaton');
            }

            if (!Array.isArray(colors) || colors.length !== ca.cell_value_count) {
                throw new Error(`colors must be an array of specification objects with length = ca.cell_value_count (${ca.cell_value_count})`);
            }
            for (const color of colors) {
                if (typeof color !== 'string') {
                    throw new Error('color elements must be strings');
                }
            }

            const {
                cell_width        = 1,
                cell_height       = 1,
                cell_border_width = 0,
                cell_border_color = '#ffff0080',
            } = (options ?? {});

            if (!Number.isInteger(cell_width) || cell_width <= 0) {
                throw new Error('cell_width must be a positive integer');
            }
            if (!Number.isInteger(cell_height) || cell_height <= 0) {
                throw new Error('cell_height must be a positive integer');
            }
            if (!Number.isInteger(cell_border_width) || cell_border_width < 0) {
                throw new Error('cell_border_width must be a non-negative integer');
            }
            if (cell_width <= 2*cell_border_width) {
                throw new Error('cell_width too small for given cell_border_width');
            }
            if (cell_height <= 2*cell_border_width) {
                throw new Error('cell_height too small for given cell_border_width');
            }
            if (typeof cell_border_color !== 'string') {
                throw new Error('cell_border_color must be a string');
            }

            this._ca                = ca;
            this._colors            = colors;
            this._cell_width        = cell_width;
            this._cell_height       = cell_height;
            this._cell_border_width = cell_border_width;
            this._cell_border_color = cell_border_color;
        }

        get ca                (){ return this._ca; }
        get colors            (){ return this._colors; }
        get cell_width        (){ return this._cell_width; }
        get cell_height       (){ return this._cell_height; }
        get cell_border_width (){ return this._cell_border_width; }
        get cell_border_color (){ return this._cell_border_color; }

        render(ctx, initial_row, x, y, generations) {
            if (this.cell_border_width > 0) {
                // fill entire area with cell_border_color to efficiently simulate individual borders
                const w = this.cell_width  * initial_row.length;
                const h = this.cell_height * (generations + 1);
                ctx.fillStyle = this.cell_border_color;
                ctx.fillRect(x, y, w, h);
            }
            let row = initial_row;
            this.render_row(ctx, row, x, y);
            y += this.cell_height;
            for (let g = 0; g < generations; g++) {
                row = this.ca.generate(row);
                this.render_row(ctx, row, x, y);
                y += this.cell_height;
            }
        }

        render_row(ctx, row, x, y) {
            x += this.cell_border_width;
            y += this.cell_border_width;
            const w = this.cell_width  - 2*this.cell_border_width;
            const h = this.cell_height - 2*this.cell_border_width;
            for (const value of row) {
                ctx.fillStyle = this.colors[value];
                ctx.fillRect(x, y, w, h);
                x += this.cell_width;
            }
        }
    }


    // === EXPORT ===

    facet_export({
        CellularAutomaton,
        ECA,
        CellularAutomatonRenderer,
    });

} catch (err) { facet_load_error(err, current_script); } })(globalThis.core.facet_init());  // facet end

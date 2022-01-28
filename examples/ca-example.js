var {
    cellular_automaton: {
        CellularAutomaton,
        ECA,
        CellularAutomatonRenderer,
    },
} = await import_lib('cmjs.js');

const cell_value_count = 8;
const input_radius     = 2;

const { input_width } = CellularAutomaton.stats(cell_value_count, input_radius);

function output_transitions(ctx, color, x, y, transitions) {
    return [x, y];
    ctx.fillStyle = color;
    for (const [window, value] of transitions) {
        const str = sprintf('%j -> %d', window, value);
        ctx.fillText(str, x, y);
        y += 10;//!!!
    }
    return [x, y];
}

function inc_window(w) {
    w = [...w];  // copy
    for (let i = 0; i < input_width; i++) {
        if ((w[i] += 1) < cell_value_count) {
            return w;  // indicate: continue
        }
        w[i] = 0;
    }
    return null;  // indicate: done
}

const initial_window = [];
for (let i = 0; i < input_width; i++) {
    initial_window.push(0);
}

function display_ca() {
    const transitions = [];
    const k = 0.5;
    const m = 2**(k*cell_value_count);
    for (let w = initial_window; w; w = inc_window(w)) {
        const value = Math.trunc(2**(k*cell_value_count*Math.random())*cell_value_count/m);
        transitions.push([w, value]);
    }

    const ca = new CellularAutomaton(transitions, cell_value_count, input_radius);

    function color_by_brightness(brightness) {
        return `hsl(${0.6 - brightness/2}turn, 100%, ${40 + brightness*40}%)`;
    }

    const colors = new Array(cell_value_count);
    for (let i = 0; i < cell_value_count; i++) {
        colors[i] = color_by_brightness(i/cell_value_count);
    }

    const row_radius = 70;

    const cell_width        = 7;
    const cell_height       = 7;
    const cell_border_width = 1;
    const cell_border_color = '#000';

    const renderer = new CellularAutomatonRenderer(ca, colors, {
        cell_width,
        cell_height,
        cell_border_width,
        cell_border_color,
    });

    const margin_x = 10;
    const margin_y = 10;

    const initial_row = ca.create_row(2*row_radius + 1);
    initial_row[Math.trunc(initial_row.length/2)] = 1;

    const size_config = [
        initial_row.length*cell_width + 2*margin_x,
        row_radius*cell_height + 2*margin_y
    ];
    const canvas = output_context.create_output_element({
        size_config,
        child_tag: 'canvas',
    });
    const ctx = canvas.getContext('2d');
    const [x, y] = output_transitions(ctx, 'black', margin_x, margin_y, transitions);
    renderer.render(ctx, initial_row, x, y, row_radius);
}

for (let i = 0; i < 3; i++) {
    display_ca();
}

const {
    Plotly,
} = await import('../src/notebook/output-handlers/plotly.js');

const {
    Simulation,
} = await import('./clusters-like.js');

const html = `
<style>
    #plotter_info_display {
        display: flex;
        gap: 2rem;
    }

    #plotter_play_controls {
        padding-top: 0.5rem;
        padding-bottom: 0.5rem;
    }

    #plotter_controls {
        width: fit-content;
    }
    #plotter_controls div * {
        vertical-align: middle;
    }

    #plotter_adjustments {
        display: grid;
        grid-template-columns: max-content max-content;
        gap: 0.5rem;
    }
    #plotter_adjustments label {
        justify-self: end;
    }

    #plotter_config_display {
        width: fit-content;
        font-family: monospace;
    }

    .plotter_display {
        margin-left: 0.1rem;
        padding: 0 0.5rem;
        background-color: #eee;
    }

    .hidden {
        display: none;
    }
</style>

<div id="plotter_play_controls">
    <button id="plotter_go">Go</button>
    <button id="plotter_pause" class="hidden">Pause</button>
</div>
<div id="plotter_info_display">
    <div id="plotter_controls">
        <div id="adjustments">
            <label for="loop_delay">Loop delay</label>
            <div>
                <input id="loop_delay" type="range" min="0" max="500" value="0">
                <span id="loop_delay_display" class="plotter_display"></span> ms
            </div>
        </div>
    </div>
</div>
<div id="plotter_plot"></div>
`;

export function setup(worker_pool, the_output_context, the_simulation_data) {
    the_output_context.create_output_element().innerHTML = html;

    const plot_el = document.getElementById('plotter_plot');

    const go_button    = document.getElementById('plotter_go');
    const pause_button = document.getElementById('plotter_pause');

    function set_go_button_state(running) {
        if (running) {
            go_button.innerText = 'Stop';
        } else {
            go_button.innerText = 'Go';
        }
    }

    function set_pause_button_state(paused, running) {
        pause_button.innerText = paused ? 'Resume' : 'Pause';
        if (running) {
            pause_button.classList.remove('hidden');
        } else {
            pause_button.classList.add('hidden');
        }
    }
    set_go_button_state(false);
    set_pause_button_state(false, false);

    const loop_delay_el = document.getElementById('loop_delay');

    for (const range_id of [
        'loop_delay',
    ]) {
        const range_el   = document.getElementById(range_id);
        const display_el = document.getElementById(`${range_id}_display`);
        display_el.innerText = range_el.value;
        range_el.addEventListener('input', (event) => {
            display_el.innerText = range_el.value;
        });
    }

    const plot_height = 720;
    plot_el.style = `height: ${plot_height}px`;

    let runner;
    const set_running_state = (running) => {
        runner?.stop();
        if (running) {
            const new_runner = new Runner(the_simulation_data);
            runner = new_runner;
            new_runner.done.then(
                () => {
                    set_running_state(false);
                },
                error => {
                    set_running_state(false);
                }
            );
            go_button.innerText = 'Stop';
            document.getElementById('plotter_play_controls').scrollIntoView();
        } else {
            runner = undefined;
            go_button.innerText = 'Go';
        }
    }
    go_button.addEventListener('click', async (event) => {
        set_running_state(!runner);
    });

    class Runner {
        constructor(simulation_data) {
            this._simulation = new Simulation(simulation_data);

            const flavor_entries = Object.entries(this._simulation.flavor_descriptors);
            const flavor_name_to_index = Object.fromEntries(flavor_entries.map(([ flavor_name ], index) => ([ flavor_name, index ])));
            function flavor_name_to_marker_color_value(flavor_name) {
                // marker color values range from 0 to 1
                return (flavor_entries.length > 1)
                    ? flavor_name_to_index[flavor_name] / (flavor_entries.length - 1)
                    : 0;
            }

            this._gdata = [];

            this._particle_trace = {
                name: 'particles',
                showlegend: true,
                type: 'scatter3d',
                mode: 'markers',
                marker: {
                    size:       this._simulation.particle_size,
                    cmin:       0,
                    cmax:       1,
                    colorscale: flavor_entries.map(([ flavor_name, { color } ]) => ([ flavor_name_to_marker_color_value(flavor_name), color ])),
                    color:      this._simulation.particles.map(({ flavor }) => flavor_name_to_marker_color_value(flavor)),
                },
                x: this._simulation.position[0],
                y: this._simulation.position[1],
                z: this._simulation.position[2],
            };
            this._gdata.push(this._particle_trace);

            this._extrema_trace = {
                name: 'extrema',
                showlegend: false,
                type: 'scatter3d',
                mode: 'markers',
                x: [],
                y: [],
                z: [],
                marker: {
                    color: 'rgba(0, 0, 0, 0.01)',
                    size: 1,
                },
            };
            this._gdata.push(this._extrema_trace);
console.log(this._simulation, this._gdata);//!!!

            this._mouse_paused = false;
            this._the_plot_el_mousedown_handler = (event) => { this._mouse_paused = true; };
            this._the_plot_el_mousedown_handler_options = { capture: true };
            this._the_plot_el_mouseup_handler = (event) => { this._mouse_paused = false; };
            this._the_plot_el_mouseup_handler_options = { capture: true };
            plot_el.addEventListener(
                'mousedown',
                this._the_plot_el_mousedown_handler,
                this._the_plot_el_mousedown_handler_options
            );
            plot_el.addEventListener(
                'mouseup',
                this._the_plot_el_mouseup_handler,
                this._the_plot_el_mouseup_handler_options
            );

            this._button_paused = false;
            this._the_pause_button_click_handler = (event) => {
                this._button_paused = !this._button_paused;
                set_pause_button_state(this._button_paused, this._running);
            };
            this._the_pause_button_click_handler_options = {};
            pause_button.addEventListener(
                'click',
                this._the_pause_button_click_handler,
                this._the_pause_button_click_handler_options
            );

            this._running = false;

            this._done = new Promise(async (resolve, reject) => {
                try {
                    this._running = true;
                    set_go_button_state(this._running);
                    set_pause_button_state(this._button_paused, this._running);

                    let plot_fn = Plotly.newPlot;

                    while (this._running) {
                        if (!this.paused) {
                            this._draw_data(plot_fn);
                            plot_fn = Plotly.react;

                            this._simulation.step();
                        }

                        const loop_delay = this.paused ? 10 : parseInt(loop_delay_el.value);
                        await new Promise(resolve => setTimeout(resolve, loop_delay));
                    }

                    resolve();

                } catch (err) {
                    console.error(err.message, err.stack);
                    alert(`${err.message}\n\n${err.stack}`);
                    reject(err);
                }
            });
        }

        get running (){ return this._running; }
        get paused  (){ return this._mouse_paused || this._button_paused; }
        get done    (){ return this._done; }

        stop() {
            this._running = false;
            plot_el.removeEventListener(
                'mousedown',
                this._the_plot_el_mousedown_handler,
                this._the_plot_el_mousedown_handler_options
            );
            plot_el.removeEventListener(
                'mouseup',
                this._the_plot_el_mouseup_handler,
                this._the_plot_el_mouseup_handler_options
            );
            pause_button.removeEventListener(
                'click',
                this._the_pause_button_click_handler,
                this._the_pause_button_click_handler_options
            );
            this._button_paused = false;
            set_pause_button_state(this._button_paused, this._running);
        }

        // internal

        _draw_data(plot_fn, no_update_revision=false) {
            // update extrema
            let values_seen = false;
            let min_x = Infinity, max_x = -Infinity,
                min_y = Infinity, max_y = -Infinity,
                min_z = Infinity, max_z = -Infinity;
            for (const trace of this._gdata) {
                if (trace.x.length > 0 || trace.y.length > 0 || trace.z.length > 0) {
                    values_seen = true;
                }

                for (const v of trace.x) {
                    if (v < min_x) {
                        min_x = v;
                    }
                    if (v > max_x) {
                        max_x = v;
                    }
                }
                for (const v of trace.y) {
                    if (v < min_y) {
                        min_y = v;
                    }
                    if (v > max_y) {
                        max_y = v;
                    }
                }
                for (const v of trace.z) {
                    if (v < min_z) {
                        min_z = v;
                    }
                    if (v > max_z) {
                        max_z = v;
                    }
                }
            }
            if (values_seen) {
                this._extrema_trace.x = [ min_x, max_x ];
                this._extrema_trace.y = [ min_y, max_y ];
                this._extrema_trace.z = [ min_z, max_z ];
            }

            // update layout
            const layout = {
                height: plot_height,
            };
            if (!no_update_revision) {
                layout.datarevision = Date.now();
            }
            // note: plot_el._fullLayout is undocumented...
            if (plot_el._fullLayout?.scene?.camera) {
                layout.scene = {
                    camera: plot_el._fullLayout.scene.camera,
                };
            }
            if (this._equation_def?.title) {
                layout.title = this._equation_def.title;
            }
            plot_fn(plot_el, this._gdata, layout);
        }
    }

    setTimeout(() => {
        document.getElementById('adjustments').scrollIntoView(false);
        go_button.focus();
    }, 500);
}

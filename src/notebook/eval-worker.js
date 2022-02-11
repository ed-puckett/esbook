// EXPRESSION EVALUATION
// ---------------------
// Within an expression, the "this" object references the eval_state
// object of the notebook.  This object persists until the notebook
// is opened to a new file or is cleared, at which point it is reset
// to {}.
//
// During evaluation, this.eval_context references an object whose
// properties are available directly for evaluation within any
// interaction element, without the need to prefix them with any parent
// object.  In this sense, this.eval_context acts like a global
// environment for the notebook without the need to modify globalThis.
//
// global_export(...objects) assigns new properties to this.eval_context.
// Those properties then become available "globally".  Note that the
// "global" objects are available from any interaction element, that
// is until the notebook is opened to a new file or is cleared.
//
// Other properties set on the "this" object, like the "global"
// properties, persist until the notebook is opened to a new file or
// is cleared.  However, those properties must be prefixed by "this."
// to reference them.
//
// A return statement within an interaction element terminates the
// evaluation and the value of the return statement becomes the result
// of the evaluation.
//
// Ephemeral eval_context
// ----------------------
// During evaluation, a number of other values are available "globally",
// though these values do not persist after the particular evaluation
// (except for references from async code started during the evaluation).
// These values include output_context (which provides utilities for
// manipulation of the output of the interaction element), various
// mathematics interfaces, and various graphics functions and other
// functions to manipluate the output.  Also included are:
//
//     import_lib:    import other libraries from the lib/ directory
//     global_export: export new "global" properties
//     is_stopped:    determine if the evaluation has been stopped
//
// These all continue to be available even after the evaluation has
// returned if there are any async actions still active.
// See the method _create_ephemeral_eval_context().


const script_url = import.meta.url;

const {
    load_script,
} = await import('../dom-util.js');

const {
    generate_uuid,
} = await import('../uuid.js');

const {
    sprintf,
} = await import('../sprintf.js');


const nerdamer_script_url = new URL('../../node_modules/nerdamer/all.min.js', import.meta.url);
await load_script(document.head, nerdamer_script_url);

export class TextuallyLocatedError extends Error {
    constructor(message, line_col) {
        super(message);
        this.line_col = line_col;
    }
}

const AsyncFunction = Object.getPrototypeOf(async()=>{}).constructor;

// may throw an error
// returns: { type: 'text', text: string, is_tex: boolean, inline_tex: boolean }
function transform_text_result(result) {
    let text = undefined, is_tex = false, inline_tex = false;
    try {
        if (typeof result === 'object' && typeof result.toTeX === 'function' && typeof result.symbol !== 'undefined') {
            // looks like result from a nerdamer object
            text = result.toTeX()
            is_tex = true;
        } else if (typeof result === 'undefined') {
            text = '[undefined]';
        } else if (typeof result.toString === 'function') {
            text = result.toString();
        } else {
            text = '[unprintable result]';
        }
    } catch (err) {
        console.error('transform_text_result error', err);
    }
    return { type: 'text', text, is_tex, inline_tex };
}

export class EvalWorker {
    /** Call this function instead of constructing an instance with new.
     *  @param {Object} eval_state will be present as "this" during evaluation
     *  @param {OutputContext} output_context object containing output
     *                         manipulation methods and state.
     *  @param {string} expression to be evaluated.
     *  @return {Promise} resolves to the new instance after its _run()
     *                    method resolves and returns.  Note that the
     *                    return of the _run method does not necessarily
     *                    mean that the instance is "done".
     */
    static async eval(eval_state, output_context, expression) {
        return new EvalWorker(eval_state, output_context, expression)._run();
    }

    constructor(eval_state, output_context, expression) {
        Object.defineProperties(this, {
            id: {
                value: generate_uuid(),
                enumerable: true,
            },
            eval_state: {
                value: eval_state,
                enumerable: true,
            },
            output_context: {
                value: output_context,
                enumerable: true,
            },
            expression: {
                value: expression,
                enumerable: true,
            },
            _stopped: {
                value: false,
                writable: true,
            },
        });

        // establish this.eval_state.eval_context if not already present
        if (!this.eval_state.eval_context) {
            Object.defineProperties(this.eval_state, {
                eval_context: {
                    value: {},
                    enumerable: false,
                },
            });
        }
    }

    stop() {
        this._stopped = true;
    }

    async _run() {
        const self = this;

        const ephemeral_eval_context = self._create_ephemeral_eval_context();
        const ephemeral_eval_context_entries = Object.entries(ephemeral_eval_context);

        // create an async function with the expression as the heart of its
        // body, and with parameters being the keys of ephemeral_eval_context.
        // Then, the expression will be evaluated by applying the function to
        // the corresponding values from ephemeral_eval_context.  Note that
        // evaluation will be performed in the global context.
        const eval_fn_params = ephemeral_eval_context_entries.map(([k, _]) => k);
        const eval_fn_args   = ephemeral_eval_context_entries.map(([_, v]) => v);

        // evaluate the expression:
        const eval_fn_this = self.eval_state;
        const eval_fn_body = `with (this.eval_context) { ${self.expression} }`;  // note: "this" will be self.eval_state
        const eval_fn = new AsyncFunction(...eval_fn_params, eval_fn_body);
        try {
            const result = await eval_fn.apply(eval_fn_this, eval_fn_args);
            if (typeof result !== 'undefined') {
                await ephemeral_eval_context.process_action(transform_text_result(result));  // action: { type: 'text', text, is_tex, inline_tex }
            }
        } catch (err) {
            try {
                await ephemeral_eval_context.process_error(err);
            } catch (err2) {
                console.error('unexpected: second-level error occurred', err2);
            }
        }

        return self;
    }

    _create_ephemeral_eval_context() {
        const self = this;

        const lib_dir_url = new URL('../../lib/', script_url);
        function import_lib(lib_path) {
            return import(new URL(lib_path, lib_dir_url));
        }

        function global_export(...objects) {
            return Object.assign(self.eval_state.eval_context, ...objects);
        }

        function is_stopped() {
            return self._stopped;
        }

        function delay_ms(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        async function process_action(action) {
            if (self._stopped) {
                throw new Error('error received after EvalWorker already stopped');
            } else {
                return self.output_context.output_handler_update_notebook(action.type, action);
            }
        }

        async function process_error(error) {
            if (self._stopped) {
                throw new Error('error received after EvalWorker already stopped');
            } else {
                return self.output_context.output_handler_update_notebook('error', error);
            }
        }

        async function println(output) {
            output = (typeof output === 'undefined') ? '' : output;
            return process_action(transform_text_result(output + '\n'));  // action: { type: 'text', text, is_tex, inline_tex }
        }

        async function printf(format, ...args) {
            format = (typeof format === 'undefined') ? '' : format.toString();
            return process_action(transform_text_result(sprintf(format, ...args)));  // action: { type: 'text', text, is_tex, inline_tex }
        }

        async function html(tag, attrs, innerHTML) {
            const action = {
                type: 'html',
                tag,
                attrs,
                innerHTML,
            };
            return process_action(action);
        }

        async function graphics(type, args) {
            return process_action({
                type,
                args,
            });
        }

        async function chart(...args) {
            return graphics('chart', args);
        }

        async function dagre(...args) {
            return graphics('dagre', args);
        }

        async function draw_image_data(...args) {
            return graphics('image_data', args);
        }

        async function plotly(...args) {
            return graphics('plotly', args);
        }

        const ephemeral_eval_context = {
            output_context: self.output_context,
            _:        nerdamer,
            factor:   nerdamer.factor.bind(nerdamer),
            simplify: nerdamer.simplify.bind(nerdamer),
            expand:   nerdamer.expand.bind(nerdamer),
            import_lib,
            global_export,
            is_stopped,
            delay_ms,
            process_action,
            process_error,
            println,
            printf,
            html,
            graphics,
            chart,
            dagre,
            draw_image_data,
            plotly,
        };

        return ephemeral_eval_context;
    }
}

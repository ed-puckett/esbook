'use strict';

(async ({ current_script, facet_export, facet_load_error }) => { try {  // facet begin

    const {
        output_handlers,
    } = await facet('facet/notebook/output-handlers.js');

    const nerdamer_script_url = new URL('../../../node_modules/nerdamer/all.min.js', current_script.src);
    await load_script(document.head, nerdamer_script_url);

    class TextuallyLocatedError extends Error {
        constructor(message, line_col) {
            super(message);
            this.line_col = line_col;
        }
    }

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

    function create_eval_context(post_value) {
        function pp(thing, indent=4) {
            let rest_args = [];
            if (indent !== null && typeof indent !== 'undefined') {
                if (!Number.isInteger(indent)) {
                    throw new Error('indent must be an integer');
                }
                rest_args = [null, indent];
            }
            return JSON.stringify(thing, ...rest_args);
        }

        function println(output) {
            output = (typeof output === 'undefined') ? '' : output;
            post_value(transform_text_result(output + '\n'));  // value: { type: 'text', text, is_tex, inline_tex }
        }

        function printf(format, ...args) {
            format = (typeof format === 'undefined') ? '' : format.toString();
            post_value(transform_text_result(sprintf(format, ...args)));  // value: { type: 'text', text, is_tex, inline_tex }
        }

        function graphics(type, args) {
            post_value({
                type,
                args,
            });
        }

        function chart(...args) {
            graphics('chart', args);
        }

        function dagre(...args) {
            graphics('dagre', args);
        }

        function image_data(...args) {
            graphics('image_data', args);
        }

        function create_canvas2d(size_config) {
            return new Canvas2dContext(graphics, size_config);
        }

        function plotly(...args) {
            graphics('plotly', args);
        }

        const eval_context = {
            _:        nerdamer,
            factor:   nerdamer.factor.bind(nerdamer),
            simplify: nerdamer.simplify.bind(nerdamer),
            expand:   nerdamer.expand.bind(nerdamer),
            pp,
            println,
            printf,
            graphics,
            chart,
            dagre,
            image_data,
            create_canvas2d,
            plotly,
         };

        return eval_context;
    }

    function expression_evaluator(expression, post_value) {
        const eval_context = create_eval_context(post_value);

        // Create a "full expression" that is a block containing bindings for
        // all the values in eval_context.  This allows us to evaluate
        // expression in a context that contains these bindings but then
        // remove all the temporary bindings from globalThis and while letting
        // async code from expression still work after this function exits.

        if (globalThis.hasOwnProperty('eval_context')) {
            throw new Error('expression_evaluator: globalThis already has a property named "eval_context"');
        }
        globalThis.eval_context = eval_context;

        var full_expression = `{const ${Object.entries(eval_context).map(([prop]) => `${prop}=eval_context.${prop}`).join(',')};${expression}}`;

        let result;
        try {
            // evaluate the expression in the global context by using (0, eval) for the reference to eval
            result = (0, eval)(full_expression);  // may throw an error
        } finally {
            delete globalThis.eval_context;
        }

        Promise.resolve(result)  // takes care of waiting for result if result is a Promise
            .then(result_value => {
                // if expression does not end with ';', include the final result in outputs
                if (!expression.trim().endsWith(';')) {
                    post_value(transform_text_result(result_value));  // value: { type: 'text', text, is_tex, inline_tex }
                }
            });
    }

    class EvalWorker {
        constructor(ie, output_data_collection, expression) {
            Object.defineProperties(this, {
                id: {
                    value: generate_uuid(),
                    enumerable: true,
                },
                ie: {
                    value: ie,
                    enumerable: true,
writable: true,//!!!
                },
                output_data_collection : {
                    value: output_data_collection,
                    enumerable: true,
writable: true,//!!!
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
            this._eval_expression(expression);
        }

        stop() {
            this._stopped = true;
        }

        _eval_expression() {
            const self = this;

            const pending_values = [];
            let waiting_for_value;  // set when pending_values is empty; a promise on which the value processor is waiting

            function clear_pending_values() {
                pending_values.splice(0, pending_values.length);  // make pending_values empty
            }

            function cleanup_after_stopped() {
                clear_pending_values();
                if (waiting_for_value) {
                    const w = waiting_for_value;
                    waiting_for_value = undefined;
                    w.reject(new Error('stopped'));
self.ie = undefined;//!!!
self.output_data_collection = undefined;//!!!
                }
            }
            function consume_pending_values() {
                while (pending_values.length > 0) {
                    const value = pending_values.shift();
                    const handler = output_handlers[value.type];
                    if (!handler) {
                        process_error(new Error(`unknown output type: ${value.type}`));
                    } else {
                        //!!! update_notebook is an async method, but not waiing...
                        handler.update_notebook(self.ie, self.output_data_collection, value);
                    }
                }
            }

            function process_pending_values() {
                if (self._stopped) {
                    cleanup_after_stopped();
                } else {
                    if (waiting_for_value) {
                        const w = waiting_for_value;
                        waiting_for_value = undefined;
                        w.resolve();
                    } else {
                        consume_pending_values();
                        waiting_for_value = new OpenPromise();
                        waiting_for_value.then(process_pending_values, process_error);
                    }
                }
            }

            function process_error(error) {
                if (self._stopped) {
                    cleanup_after_stopped();
                } else {
                    output_handlers.error.update_notebook(self.ie, self.output_data_collection, error)
                }
            }

            function post_value(value) {
                if (self._stopped) {
                    console.warn('** value received after stopped', value);
                    cleanup_after_stopped();
                } else {
                    pending_values.push(value);
                    process_pending_values();
                }
            }

            function post_error(error) {
                if (self._stopped) {
                    console.warn('** error received after stopped', error);
                    cleanup_after_stopped();
                } else {
                    process_error(error);
                }
            }

            // run the evaluation:
            try {
                expression_evaluator(self.expression, post_value);
            } catch (err) {
                post_error(err);
            }
        }
    }

    facet_export({
        TextuallyLocatedError,
        EvalWorker,
    });

} catch (err) { facet_load_error(err, current_script); } })(facet_init());  // facet end

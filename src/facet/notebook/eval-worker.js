'use strict';

(async ({ current_script, facet, facet_export, facet_load_error }) => { try {  // facet begin

    const {
        output_handlers,
    } = await facet('facet/notebook/output-handlers.js');

    const nerdamer_script_url = new URL('../../../node_modules/nerdamer/all.min.js', current_script.src);
    await globalThis.core.load_script(document.head, nerdamer_script_url);

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

    function create_eval_context(post_action) {
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
            post_action(transform_text_result(output + '\n'));  // action: { type: 'text', text, is_tex, inline_tex }
        }

        function printf(format, ...args) {
            format = (typeof format === 'undefined') ? '' : format.toString();
            post_action(transform_text_result(sprintf(format, ...args)));  // action: { type: 'text', text, is_tex, inline_tex }
        }

        function output_context_method(method, args, image_uri=null) {
            post_action({
                type: 'output_context_method',
                method,
                args,
                image_uri,
            });
        }

        function graphics(type, args) {
            post_action({
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

    function expression_evaluator(expression, post_action) {
        const eval_context = create_eval_context(post_action);

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
                    post_action(transform_text_result(result_value));  // action: { type: 'text', text, is_tex, inline_tex }
                }
            });
    }

    class EvalWorker {
        constructor(output_context, expression) {
            Object.defineProperties(this, {
                id: {
                    value: globalThis.core.generate_uuid(),
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
            this._eval_expression();
        }

        stop() {
            this._stopped = true;
        }

        _eval_expression() {
            const self = this;

            const pending_actions = [];
            let waiting_for_action;  // set when pending_actions is empty; a promise on which the action processor is waiting

            function clear_pending_actions() {
                pending_actions.splice(0, pending_actions.length);  // make pending_actions empty
            }

            function cleanup_after_stopped() {
                clear_pending_actions();
                if (waiting_for_action) {
                    const w = waiting_for_action;
                    waiting_for_action = undefined;
                    w.reject(new Error('stopped'));
                }
            }

            function consume_pending_actions() {
                while (pending_actions.length > 0) {
                    const action = pending_actions.shift();
                    const handler = output_handlers[action.type];
                    if (!handler) {
                        process_error(new Error(`unknown output type: ${action.type}`));
                    } else {
                        //!!! update_notebook is an async method, but not waiting...
                        handler.update_notebook(self.output_context, action);
                    }
                }
            }

            function process_pending_actions() {
                if (self._stopped) {
                    cleanup_after_stopped();
                } else {
                    if (waiting_for_action) {
                        const w = waiting_for_action;
                        waiting_for_action = undefined;
                        w.resolve();
                    } else {
                        consume_pending_actions();
                        waiting_for_action = new globalThis.core.OpenPromise();
                        waiting_for_action.then(process_pending_actions, process_error);
                    }
                }
            }

            function process_error(error) {
                if (self._stopped) {
                    cleanup_after_stopped();
                } else {
                    //!!! update_notebook is an async method, but not waiting...
                    output_handlers.error.update_notebook(self.output_context, error)
                }
            }

            function post_action(action) {
                if (self._stopped) {
                    console.warn('** action received after stopped', action);
                    cleanup_after_stopped();
                } else {
                    pending_actions.push(action);
                    process_pending_actions();
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
                expression_evaluator(self.expression, post_action);
            } catch (err) {
                post_error(err);
            }
        }
    }

    facet_export({
        TextuallyLocatedError,
        EvalWorker,
    });

} catch (err) { facet_load_error(err, current_script); } })(globalThis.core.facet_init());  // facet end

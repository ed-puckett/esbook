// 'use strict';// not strict mode because we use a "with" statement

(async ({ current_script, facet_export, facet_load_error }) => { try {  // facet begin

    const {
        output_handlers,
    } = await facet('facet/notebook/output-handlers.js');

    function expression_evaluator(expression, post_value) {
        const eval_context = {};

        eval_context.pp = (thing, indent=4) => {
            let rest_args = [];
            if (indent !== null && typeof indent !== 'undefined') {
                if (!Number.isInteger(indent)) {
                    throw new Error('indent must be an integer');
                }
                rest_args = [null, indent];
            }
            return JSON.stringify(thing, ...rest_args);
        };
        // provide a print() implementation
        eval_context.print = (output) => {
            output = (typeof output === 'undefined') ? '' : output;
            post_value(transform_text_result(output));  // value: { type: 'text', text, is_tex, inline_tex }
        };
        eval_context.println = (output) => {
            output = (typeof output === 'undefined') ? '' : output;
            post_value(transform_text_result(output + '\n'));  // value: { type: 'text', text, is_tex, inline_tex }
        }
        eval_context.printf = (...args) => {
            eval_context.print(sprintf(...args));
        };
        // provide a graphics implementation
        eval_context.graphics = (type, args) => {
            post_value({
                type,
                args,
            });
        };
        // provide a chart() implementation
        eval_context.chart = (...args) => {
            eval_context.graphics('chart', args);
        };
        // provide a dagre() implementation
        eval_context.dagre = (...args) => {
            eval_context.graphics('dagre', args);
        };
        // provide an image_data() implementation
        eval_context.image_data = (...args) => {
            eval_context.graphics('image_data', args);
        };
        // provide a canvas2d() implementation
        eval_context.create_canvas2d = (size_config) => {
            return new Canvas2dContext(eval_context.graphics, size_config);
        };
        // provide a plotly() implementation
        eval_context.plotly = (...args) => {
            eval_context.graphics('plotly', args);
        };

        const result = eval(`with (eval_context) ${expression}`);  // may throw an error

        Promise.resolve(result)  // takes care of waiting for result if result is a Promise
            .then(result_value => {
                // if expression does not end with ';', include the final result in outputs
                if (!expression.trim().endsWith(';')) {
                    post_value(transform_text_result(result_value));  // value: { type: 'text', text, is_tex, inline_tex }
                }
            });
    }

    const nerdamer_script_url = new URL('../../../node_modules/nerdamer/all.min.js', current_script.src);
    await load_script(document.head, nerdamer_script_url);

    var _ = nerdamer;
    var { factor, simplify, expand } = nerdamer;

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

    // Make sure the given Error object is serializable across the Web Worker
    // interface.  This works for the error objects manufactured for, e.g.,
    // expression evaluation errors.
    function clean_error(err) {
        return {
            ...err,
            message: err.message,
            stack:   err.stack,
        };
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
                },
                output_data_collection : {
                    value: output_data_collection,
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

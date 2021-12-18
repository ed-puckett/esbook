'use strict';

(async ({ current_script, facet_export, facet_load_error }) => { try {  // facet begin

    const {
        output_handlers,
    } = await facet('facet/notebook/output-handlers.js');

    const nerdamer_script_url = new URL('../../../../node_modules/nerdamer/all.min.js', current_script.src);
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

    class MaxPendingInputsExceededError extends Error {
        constructor(max_pending_inputs) {
            super(`max_pending_inputs exceeded (${max_pending_inputs})`);
        }
    }

    class EvalWorker {
        constructor(expression) {
            this.id = generate_uuid();
            this.expression = expression;
            //!!!
            this.evaluator = this.eval_expression();
        }

        stop() {
            //!!!
            this.evaluator.stop();
        }

        eval_expression() {
            const this_eval_worker = this;

            const max_pending_inputs = Infinity;

            // return an async iterable object:
            return {
                [Symbol.asyncIterator]() {
                    const pending_inputs  = [];  // unemitted values sent to post_value()
                    const waiting_outputs = [];  // unsettled promises emitted from next()
                    let   done_promise;          // will be set to final "done" promise (either resolved or rejected)

                    function post_value(value) {
                        if (done_promise) {
                            console.warn('** value pushed after done', value);
                        } else {
                            const ival = { value };
                            if (waiting_outputs.length > 0) {
                                waiting_outputs.shift().resolve(ival);
                            } else {
                                if (pending_inputs.length >= max_pending_inputs) {
                                    throw new MaxPendingInputsExceededError(max_pending_inputs);
                                }
                                pending_inputs.push(ival);
                            }
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

                    function post_done() {
                        if (done_promise) {
                            console.warn('** done set more than once');
                        } else {
                            const ival = { done: true };
                            done_promise = Promise.resolve(ival);
                            // resolve any waiting_outputs with this done value
                            while (waiting_outputs.length > 0) {
                                waiting_outputs.shift().resolve(ival);
                            }
                        }
                    }

                    function post_error(reason) {
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

                    // create the async iterator object that will be returned after running the evaluation:
                    const eval_results_iterator = {
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

                    // run the evaluation:
                    try {

                        self.pp = function pp(thing, indent=4) {
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
                        self.print = (output) => {
                            output = (typeof output === 'undefined') ? '' : output;
                            post_value(transform_text_result(output));  // value: { type: 'text', text, is_tex, inline_tex }
                        };
                        self.println = (output) => {
                            output = (typeof output === 'undefined') ? '' : output;
                            post_value(transform_text_result(output + '\n'));  // value: { type: 'text', text, is_tex, inline_tex }
                        }
                        self.printf = (...args) => {
                            self.print(sprintf(...args));
                        };
                        // provide a graphics implementation
                        self.graphics = (type, args) => {
                            post_value({
                                type,
                                args,
                            });
                        };
                        // provide a chart() implementation
                        self.chart = (...args) => {
                            self.graphics('chart', args);
                        };
                        // provide a dagre() implementation
                        self.dagre = (...args) => {
                            self.graphics('dagre', args);
                        };
                        // provide an image_data() implementation
                        self.image_data = (...args) => {
                            self.graphics('image_data', args);
                        };
                        // provide a canvas2d() implementation
                        self.create_canvas2d = (size_config) => {
                            return new Canvas2dContext(self.graphics, size_config);
                        };
                        // provide a plotly() implementation
                        self.plotly = (...args) => {
                            self.graphics('plotly', args);
                        };

                        // evaluate in the global context
                        // note: calling (0, eval) causes evaluation in global context
                        const result = (0, eval)(this_eval_worker.expression);  // may throw an error

                        Promise.resolve(result)  // takes care of waiting for result if result is a Promise
                            .then(result_value => {
                                // if expression does not end with ';', include the final result in outputs
                                if (!this_eval_worker.expression.trim().endsWith(';')) {
                                    post_value(transform_text_result(result_value));  // value: { type: 'text', text, is_tex, inline_tex }
                                }
                                post_done();
                            });

                    } catch (err) {
                        post_error(err);
                    }

                    return eval_results_iterator;
                },
            };
        }


    }

    facet_export({
        TextuallyLocatedError,
        EvalWorker,
    });

} catch (err) { facet_load_error(err, current_script); } })(facet_init());  // facet end

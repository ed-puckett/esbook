'use strict';

(async ({ current_script, facet, facet_export, facet_load_error }) => { try {  // facet begin

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

    class EvalWorker {
        /** Call this function instead of constructing an instance with new.
         *  @return {Promise} resolves to the new instance after its _run()
         *                    method resolves and returns.  Note that the
         *                    return of the _run method does not necessarily
         *                    mean that the instance is "done".
         */
        static async eval(output_context, expression) {
            return await new EvalWorker(output_context, expression)._run();
        }

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
        }

        stop() {
            this._stopped = true;
        }

        async _run() {
            const self = this;

            const eval_context = self._create_eval_context();

            // Create a "full expression" that is a block containing bindings for
            // all the values in eval_context.  This allows us to evaluate
            // expression in a context that contains these bindings but then
            // remove all the temporary bindings from globalThis and while letting
            // async code from expression still work after this function exits.

            if (globalThis.hasOwnProperty('eval_context')) {
                throw new Error('EvalWorker: globalThis already has a property named "eval_context"');
            }
            globalThis.eval_context = eval_context;

            var full_expression = `(async()=>{const ${Object.entries(eval_context).map(([prop]) => `${prop}=eval_context.${prop}`).join(',')};${self.expression}})()`;

            // run the evaluation:
            let result;
            try {
                // evaluate the expression in the global context by using (0, eval) for the reference to eval
                result = (0, eval)(full_expression);  // may throw an error
            } catch (err) {
                eval_context.process_error(err);
            } finally {
                delete globalThis.eval_context;
            }

            await Promise.resolve(result)  // takes care of waiting for result if result is a Promise
                .then(
                    result_value => {
                        if (typeof result_value !== 'undefined') {
                            eval_context.process_action(transform_text_result(result_value));  // action: { type: 'text', text, is_tex, inline_tex }
                        }
                    },
                    eval_context.process_error
                );

            return self;
        }

        _create_eval_context() {
            const self = this;

            function is_stopped() {
                return self._stopped;
            }

            async function process_action(action) {
                if (self._stopped) {
                    throw new Error('error received after EvalWorker already stopped');
                } else {
                    await self.output_context.output_handler_update_notebook(action.type, action);
                }
            }

            async function process_error(error) {
                if (self._stopped) {
                    throw new Error('error received after EvalWorker already stopped');
                } else {
                    await self.output_context.output_handler_update_notebook('error', error);
                }
            }

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
                process_action(transform_text_result(output + '\n'));  // action: { type: 'text', text, is_tex, inline_tex }
            }

            function printf(format, ...args) {
                format = (typeof format === 'undefined') ? '' : format.toString();
                process_action(transform_text_result(sprintf(format, ...args)));  // action: { type: 'text', text, is_tex, inline_tex }
            }

            function graphics(type, args) {
                process_action({
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

            function plotly(...args) {
                graphics('plotly', args);
            }

            const eval_context = {
                output_context: self.output_context,
                _:        nerdamer,
                factor:   nerdamer.factor.bind(nerdamer),
                simplify: nerdamer.simplify.bind(nerdamer),
                expand:   nerdamer.expand.bind(nerdamer),
                is_stopped,
                process_action,
                process_error,
                pp,
                println,
                printf,
                graphics,
                chart,
                dagre,
                image_data,
                plotly,
            };

            return eval_context;
        }
    }

    facet_export({
        TextuallyLocatedError,
        EvalWorker,
    });

} catch (err) { facet_load_error(err, current_script); } })(globalThis.core.facet_init());  // facet end

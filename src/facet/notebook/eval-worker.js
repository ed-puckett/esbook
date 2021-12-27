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
            const eval_context_entries = Object.entries(eval_context);

            // create an async function with the expression as its body, and
            // with parameters being the keys of eval_context.  Then, the
            // expression will be evaluated by applying the function to the
            // corresponding values from eval_context.  Note that evaluation
            // will be performed in the global context.
            const eval_fn_params = eval_context_entries.map(([k, _]) => k);
            const eval_fn_args   = eval_context_entries.map(([_, v]) => v);
            const AsyncFunction = Object.getPrototypeOf(async()=>{}).constructor;
            const eval_fn = new AsyncFunction(...eval_fn_params, self.expression)
            const eval_fn_this = globalThis;

            // evaluate the expression:
            try {
                await eval_fn.apply(eval_fn_this, eval_fn_args).then(
                    result => {
                        if (typeof result !== 'undefined') {
                            eval_context.process_action(transform_text_result(result));  // action: { type: 'text', text, is_tex, inline_tex }
                        }
                    },
                    eval_context.process_error
                );
            } catch (err) {
                eval_context.process_error(err);
            }

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

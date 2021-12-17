'use strict';

(async ({ current_script, facet_export, facet_load_error }) => { try {  // facet begin

    const nerdamer_script_url = new URL('../../../../node_modules/nerdamer/all.min.js', current_script.src);
    await load_script(document.head, nerdamer_script_url);

    var _ = nerdamer;
    var { factor, simplify, expand } = nerdamer;

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

    function eval_expression(expression) {
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
                    let result;
                    // note: calling (0, eval) causes evaluation in global context
                    result = (0, eval)(expression);  // may throw an error

                    Promise.resolve(result)  // takes care of waiting for result if result is a Promise
                        .then(result_value => {
                            // if expression does not end with ';', include the final result in outputs
                            if (!expression.trim().endsWith(';')) {
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

    class Canvas2dContext {
        static graphics_type = 'canvas2d';

        constructor(graphics_submitter, size_config) {
            this._graphics_submitter = graphics_submitter;
            this._size_config        = size_config;
            this._commands           = [];
        }

        render() {
            const graphics_args = this._size_config
                  ? [ this._size_config, this._commands ]
                  : [ this._commands ];
            this._graphics_submitter(this.constructor.graphics_type, graphics_args);
        }

        // === METHODS ===

        clearRect        (...args){ this._commands.push({ args, method: 'clearRect' }); }
        fillRect         (...args){ this._commands.push({ args, method: 'fillRect' }); }
        strokeRect       (...args){ this._commands.push({ args, method: 'strokeRect' }); }
        fillText         (...args){ this._commands.push({ args, method: 'fillText' }); }
        strokeText       (...args){ this._commands.push({ args, method: 'strokeText' }); }
        measureText      (...args){ this._commands.push({ args, method: 'measureText' }); }
        setLineDash      (...args){ this._commands.push({ args, method: 'setLineDash' }); }
        beginPath        (...args){ this._commands.push({ args, method: 'beginPath' }); }
        closePath        (...args){ this._commands.push({ args, method: 'closePath' }); }
        moveTo           (...args){ this._commands.push({ args, method: 'moveTo' }); }
        lineTo           (...args){ this._commands.push({ args, method: 'lineTo' }); }
        bezierCurveTo    (...args){ this._commands.push({ args, method: 'bezierCurveTo' }); }
        quadraticCurveTo (...args){ this._commands.push({ args, method: 'quadraticCurveTo' }); }
        arc              (...args){ this._commands.push({ args, method: 'arc' }); }
        arcTo            (...args){ this._commands.push({ args, method: 'arcTo' }); }
        ellipse          (...args){ this._commands.push({ args, method: 'ellipse' }); }
        rect             (...args){ this._commands.push({ args, method: 'rect' }); }
        fill             (...args){ this._commands.push({ args, method: 'fill' }); }
        stroke           (...args){ this._commands.push({ args, method: 'stroke' }); }
        clip             (...args){ this._commands.push({ args, method: 'clip' }); }
        rotate           (...args){ this._commands.push({ args, method: 'rotate' }); }
        scale            (...args){ this._commands.push({ args, method: 'scale' }); }
        translate        (...args){ this._commands.push({ args, method: 'translate' }); }
        transform        (...args){ this._commands.push({ args, method: 'transform' }); }
        setTransform     (...args){ this._commands.push({ args, method: 'setTransform' }); }
        resetTransform   (...args){ this._commands.push({ args, method: 'resetTransform' }); }
        drawImage        (...args){ this._commands.push({ args, method: 'drawImage' }); }
        createImageData  (...args){ this._commands.push({ args, method: 'createImageData' }); }
        putImageData     (...args){ this._commands.push({ args, method: 'putImageData' }); }
        save             (...args){ this._commands.push({ args, method: 'save' }); }
        restore          (...args){ this._commands.push({ args, method: 'restore' }); }

        // === SETTERS ===

        set globalAlpha              (value){ this._commands.push({ setter: true, value, field: 'globalAlpha' }); }
        set globalCompositeOperation (value){ this._commands.push({ setter: true, value, field: 'globalCompositeOperation' }); }
        set lineWidth                (value){ this._commands.push({ setter: true, value, field: 'lineWidth' }); }
        set lineCap                  (value){ this._commands.push({ setter: true, value, field: 'lineCap' }); }
        set lineJoin                 (value){ this._commands.push({ setter: true, value, field: 'lineJoin' }); }
        set miterLimit               (value){ this._commands.push({ setter: true, value, field: 'miterLimit' }); }
        set lineDashOffset           (value){ this._commands.push({ setter: true, value, field: 'lineDashOffset' }); }
        set font                     (value){ this._commands.push({ setter: true, value, field: 'font' }); }
        set textAlign                (value){ this._commands.push({ setter: true, value, field: 'textAlign' }); }
        set textBaseline             (value){ this._commands.push({ setter: true, value, field: 'textBaseline' }); }
        set direction                (value){ this._commands.push({ setter: true, value, field: 'direction' }); }
        set fillStyle                (value){ this._commands.push({ setter: true, value, field: 'fillStyle' }); }
        set strokeStyle              (value){ this._commands.push({ setter: true, value, field: 'strokeStyle' }); }
        set shadowBlur               (value){ this._commands.push({ setter: true, value, field: 'shadowBlur' }); }
        set shadowColor              (value){ this._commands.push({ setter: true, value, field: 'shadowColor' }); }
        set shadowOffsetX            (value){ this._commands.push({ setter: true, value, field: 'shadowOffsetX' }); }
        set shadowOffsetY            (value){ this._commands.push({ setter: true, value, field: 'shadowOffsetY' }); }
        set imageSmoothingEnabled    (value){ this._commands.push({ setter: true, value, field: 'imageSmoothingEnabled' }); }
        set imageSmoothingQuality    (value){ this._commands.push({ setter: true, value, field: 'imageSmoothingQuality' }); }
    }


    // === EXPORT ===

    facet_export(eval_expression);

} catch (err) { facet_load_error(err, current_script); } })(facet_init());  // facet end

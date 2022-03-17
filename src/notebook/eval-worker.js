const current_script_url = import.meta.url;

const {
    generate_object_id,
} = await import('../uuid.js');

const {
    OpenPromise,
} = await import('../open-promise.js');


export class EvalWorker {
    constructor() {
        Object.defineProperties(this, {
            id: {
                value: generate_object_id(),
                enumerable: true,
            },
        });
        this._worker = new Worker(new URL('./eval-worker/web-worker.js', current_script_url));
        this._terminated = false;
        this._current_expression = undefined;
    }

    get terminated (){ return this._terminated; }

    terminate() {
        if (!this._terminated) {
            this._reset_event_handlers();
            this._current_expression?.terminate();
            this._current_expression = undefined;
            this._worker.terminate();
            this._worker = undefined;
            this._terminated = true;
        }
    }

    async eval(expression, ...objects) {
        if (this.terminated) {
            throw new Error(`eval worker ${this.id}: worker has been terminated`);
        }
        if (this._current_expression) {
            throw new Error(`eval worker ${this.id}: an expression evaluation is already in process`);
        }

        const result_promise = new OpenPromise();
        let result_promise_fulfilled = false;

        const reset = () => {
            this._current_expression = undefined;
            this._reset_event_handlers();
            if (!result_promise_fulfilled) {
                result_promise.reject(new Error(`eval worker ${this.id} / expression ${expression_id}: evaluation terminated`));
            }
        };

        const expression_id = generate_object_id();

        const worker_message = {
            request: 'eval',
            id: expression_id,
            expression,
            objects,
        };

        this._current_expression = {
            ...worker_message,
            terminate() {
                reset();
            },
        };

        this._worker.onmessage = (event) => {
            const result = event.data;
            if ('value' in result) {
                result_promise.resolve(result.value);
            } else {
                result_promise.reject(result.error);
            }
            result_promise_fulfilled = true;
            reset();
        };
        this._worker.onerror = (event) => {
            result_promise.reject(new Error(`eval worker ${this.id} / expression ${expression_id}: error in worker`));
            result_promise_fulfilled = true;
            reset();
        };
        this._worker.onmessageerror = (event) => {
            result_promise.reject(new Error(`eval worker ${this.id} / expression ${expression_id}: serialization error in worker`));
            result_promise_fulfilled = true;
            reset();
        };

        this._worker.postMessage(worker_message);

        return result_promise.promise;
    }

    // returns an async interator, i.e., this function is an async generator
    stream_eval(expression, ...objects) {
        if (this.terminated) {
            throw new Error(`eval worker ${this.id}: worker has been terminated`);
        }
        if (this._current_expression) {
            throw new Error(`eval worker ${this.id}: an expression evaluation is already in process`);
        }

        // at least one of pending_results and pending_promises should be empty at any given time
        const pending_results  = [];  // values/errors waiting to be consumed
        const pending_promises = [];  // consumed promises waiting for a value/error
        let   done             = false;

        const handle_done = () => {
            done = true;
            this._current_expression = undefined;
            this._reset_event_handlers();
            while (pending_promises.length > 0) {
                pending_promises.shift().resolve({ done: true });
            }
        }

        const handle_result = (result) => {
            if (done) {
                console.warn(`eval worker ${this.id} / expression ${expression_id}: result received after done`, result);
            } else {
                if (pending_promises.length > 0) {
                    if ('value' in result) {
                        pending_promises.shift().resolve({ value: result.value });
                    } else {
                        pending_promises.shift().reject(result.error);
                    }
                } else {
                    pending_results.push(result);
                }

                // errors terminate the stream
                if (result.error) {
                    handle_done();
                }
            }
        }

        const expression_id = generate_object_id();

        const worker_message = {
            request: 'stream_eval',
            id: expression_id,
            expression,
            objects,
        };

        this._current_expression = {
            ...worker_message,
            terminate() {
                handle_done();
            },
        };

        this._worker.onmessage = (event) => {
            const result = event.data;
            if (result.done) {
                handle_done();
            } else {
                handle_result(result);
            }
        };
        this._worker.onerror = (event) => {
            handle_result({ error: new Error(`eval worker ${this.id} / expression ${expression_id}: error in worker`) });
            handle_done();
        };
        this._worker.onmessageerror = (event) => {
            handle_result({ error: new Error(`eval worker ${this.id} / expression ${expression_id}: serialization error in worker`) });
            handle_done();
        };

        this._worker.postMessage(worker_message);

        return {
            [Symbol.asyncIterator]() {
                let i = 0;
                return {
                    next() {
                        if (pending_results.length > 0) {
                            const result = pending_results.shift()
                            if ('value' in result) {
                                return Promise.resolve({ value: result.value });
                            } else {
                                return Promise.reject(result.error);
                            }
                        } else if (done) {
                            while (pending_promises.length > 0) {
                                pending_promises.shift().reject(new Error(`eval worker ${this.id} / expression ${expression_id}: no further results available`));
                            }
                            return Promise.resolve({ done: true });
                        } else {
                            const new_promise = new OpenPromise();
                            pending_promises.push(new_promise);
                            return new_promise.promise;
                        }
                    },
                    return() {
                        // This will be reached if the consumer called 'break' or 'return' early in the loop.
                        return { done: true };
                    },
                };
            },
        };
    }

    _reset_event_handlers() {
        if (!this.terminated) {
            this._worker.onmessage      = undefined;
            this._worker.onerror        = undefined;
            this._worker.onmessageerror = undefined;
        }
    }
}

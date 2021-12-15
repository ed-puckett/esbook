'use strict';

(async ({ current_script, facet_export, facet_load_error }) => { try {  // facet begin

    const message_controller = await facet('facet/message-controller.js')

    class EvalWorker {
        constructor() {
            this.id = generate_uuid();
            this._current_eval_ticket = undefined;
            this.connections = {};
            const code_path = '../eval-worker/eval-worker.js';
            const name = 'eval-worker';
            this.worker = new Worker(code_path, { name });
            this.stopped = false;
            this.worker.onmessage = this._handle_reply.bind(this);
            this.running_message_id = null;
            this._last_alert_message_id = undefined;  // message_controller.current_message_id from last alert, if any
            this._show_stop_eval_button(false);
        }
        // Allocate and return a new eval ticket.
        // Returns undefined if an eval ticket is currently allocated.
        allocate_eval_ticket() {
            if (typeof this._current_eval_ticket !== 'undefined') {
                return undefined;
            } else {
                this._current_eval_ticket = generate_uuid();
                return this._current_eval_ticket;
            }
        }
        eval_ticket_allocated() {
            return !!this._current_eval_ticket;
        }
        // Deallocate an eval ticket so that it is no longer valid
        // Returns true iff the deallocation was successful, i.e., if
        // there was currently a ticket allocated and the specified
        // ticket was the currently-allocated ticket.
        deallocate_eval_ticket(eval_ticket) {
            if (typeof this._current_eval_ticket === 'undefined' || eval_ticket !== this._current_eval_ticket) {
                return false;
            } else {
                this._current_eval_ticket = undefined;
                return true;
            }
        }
        // returns an async iterator
        eval_expression(eval_ticket, expression, start_line_col) {
            if (typeof this._current_eval_ticket === 'undefined' || eval_ticket !== this._current_eval_ticket) {
                // Return an async iterable object that, when iterated, throws
                // an error indicating that the eval ticket was invalid.
                return {
                    [Symbol.asyncIterator]: function () {
                        return {
                            next() {
                                throw new Error('invalid eval ticket');
                            },
                        };
                    },
                }
            } else {
                // Eval_ticket was valid, so send the expression to the eval-worker process.
                // This returns an async iterator that can be used to enumerate the results.
                return this._send({ expression, start_line_col });
            }
        }
        is_running() {
            return !!this.running_message_id;
        }
        alert_if_running() {
            if (!this.is_running()) {
                return false;
            } else {
                message_controller.alert('Interaction element already running');
                this._last_alert_message_id = message_controller.current_message_id;
                return true;
            }
        }
        stop() {
            this.stopped = true;
            if (!this.running_message_id) {
                return false;
            } else {
                this._show_stop_eval_button(false);
                const id = this.running_message_id;
                this.running_message_id = null;
                this.worker.terminate();
                this.connections[id].reject(new Error('processing terminated and current notebook state lost!'));
                this._cancel_alert_message();
                return true;
            }
        }
        _cancel_alert_message() {
            if (message_controller.current_message_id === this._last_alert_message_id) {
                message_controller.cancel();
                this._last_alert_message_id = undefined;
            }
        }
        _show_stop_eval_button(show) {
            if (show) {
                interaction_header.classList.add('active');
                if (stop_eval_button) {
                    stop_eval_button.classList.add('active');
                }
            } else {
                this._cancel_alert_message();
                interaction_header.classList.remove('active');
                if (stop_eval_button) {
                    stop_eval_button.classList.remove('active');
                }
            }
        }
        // returns an async iterator
        _send(msg) {
            const self = this;
            const id = generate_object_id();
            msg.id = id;
            self.running_message_id = id;
            self._show_stop_eval_button(true);

            let pending_promise;
            function create_new_promise() {
                let resolve, reject, done;
                pending_promise = new Promise((res, rej) => {
                    resolve = function (value) {
                        // create the next promise before resolving
                        // to avoid a race condition with the receiver.
                        create_new_promise();
                        res({ value });
                    };
                    reject = function (err) {
                        self.connections[id] = undefined;
                        rej(err);
                    };
                    done = function () {
                        self.connections[id] = undefined;
                        res({ done: true });
                    };
                });
                self.connections[id] = {
                    pending_promise,
                    resolve,
                    reject,
                    done,
                };
            }
            create_new_promise();
            const iterable = {
                [Symbol.asyncIterator]: function () {
                    return {
                        next: function () {
                            return pending_promise;
                        },
                    };
                },
            };
            self.worker.postMessage(msg);
            return iterable;
        }
        _handle_reply(message) {
            if (!this.stopped) {
                const reply = message.data;
                const { id, done, err, value } = reply;
                const connection = this.connections[id];
                if (id && connection) {
                    if (done) {
                        if (err) {
                            if (err.line_col) {
                                const updated_err = new TextuallyLocatedError(err.message, err.line_col);
                                updated_err.stack = err.stack;
                                connection.reject(updated_err);
                            } else {
                                connection.reject(err);
                            }
                        } else {
                            connection.done();
                        }
                        this._show_stop_eval_button(false);
                        this.running_message_id = null;
                    } else {  // value
                        connection.resolve(value);
                    }
                }
            }
        }
    }


    let eval_worker;

    // Returns a newly-allocated eval ticket if successful.
    // The returned eval_ticket must be deallocated with
    // eval_worker_deallocate_eval_ticket().
    // Returns undefined if a new eval ticket could not
    // be allocated (which would occur if the eval worker
    // already has a different eval ticket allocated).
    function establish_eval_worker(start_new=false) {
        if (start_new) {
            stop_eval_worker();
        }
        if (!eval_worker) {
            eval_worker = new EvalWorker();
        }
        return eval_worker.allocate_eval_ticket();
    }

    function eval_worker_eval_ticket_allocated() {
        if (!eval_worker) {
            return false;
        } else {
            return eval_worker.eval_ticket_allocated();
        }
    }

    function eval_worker_deallocate_eval_ticket(eval_ticket) {
        if (!eval_worker) {
            return false;
        } else {
            return eval_worker.deallocate_eval_ticket(eval_ticket);
        }
    }

    function stop_eval_worker() {
        if (eval_worker) {
            eval_worker.stop();
            eval_worker = undefined;
        }
    }

    function eval_worker_is_running() {
        return !!(eval_worker && eval_worker.is_running());
    }

    function eval_worker_alert_if_running() {
        if (!eval_worker) {
            return false;
        } else {
            return eval_worker.alert_if_running();
        }
    }

    function eval_worker_eval_expression(eval_ticket, expression, start_line_col) {
        establish_eval_worker();
        return eval_worker.eval_expression(eval_ticket, expression, start_line_col);
    }

    facet_export({
        establish_eval_worker,
        eval_worker_eval_ticket_allocated,
        eval_worker_deallocate_eval_ticket,
        stop_eval_worker,
        eval_worker_is_running,
        eval_worker_alert_if_running,
        eval_worker_eval_expression,
    });

} catch (err) { facet_load_error(err, current_script); } })(facet_init());  // facet end

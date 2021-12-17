'use strict';

(async ({ current_script, facet_export, facet_load_error }) => { try {  // facet begin

    const eval_expression = await facet('facet/notebook/eval-worker-interface/eval-expression.js');

    class EvalWorker {
        constructor() {
            this.id = generate_uuid();
            this._current_eval_ticket = undefined;
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
        eval_expression(eval_ticket, expression) {
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
                return eval_expression(expression);
            }
        }
        is_running() {
            return false;
        }
        alert_if_running() {
            return false;
        }
        stop() {
            return true;
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

    function eval_worker_eval_expression(eval_ticket, expression) {
        establish_eval_worker();
        return eval_worker.eval_expression(eval_ticket, expression);
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

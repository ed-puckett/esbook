export class Change {
    // STATIC

    static stack = [];
    static current = -1;
    static neutral = undefined;
    static _inhibit_add_change = false;

    static toString(multiline=false) {
        return `[${this.name}_class stack:[${this.stack.map(c => `${multiline ? '\n    ' : ''}${c.toString()}`)}],${multiline ? '\n    ' : ' '}current:${this.current}, neutral:${this.neutral}, _inhibit_add_change:${this._inhibit_add_change}]`;
    }

    static in_neutral_state() {
        return (this.neutral === this.current);
    }

    static add_change(change, do_change=false) {
        if (!this._inhibit_add_change) {  // otherwise in the process of an undo/redo, so don't add new change
            // remove everything from stack after current
            this.stack.splice(this.current+1, this.stack.length-(this.current+1));
            this.current = this.stack.length-1;  // last change on stack
            if (typeof this.neutral === 'number' && this.neutral > this.current) {
                // neutral position was within the removed range
                this.neutral = undefined;  // no neutral position
            }

            let coalesced;
            if ( this.neutral !== this.current &&  // don't coalesce into the neutral change
                 this.current >= 0 ) {
                coalesced = this.stack[this.current].coalesce(change);
            }

            if (coalesced) {
                // replace current change with coalesced...
                this.stack[this.current] = coalesced;
            } else {
                // add the new change:
                // add new change to stack (will be at position current+1)
                this.stack.push(change);
                // update current
                this.current = this.stack.length-1;  // last change on stack
            }

            if (do_change) {
                change.do_change();
            }

            change.notebook.send_tab_state_to_parent_processes();
        }
    }

    static reset(notebook, set_unmodified=true) {
        this.stack   = [];
        this.current = -1;
        this.neutral = undefined;
        if (set_unmodified) {
            this.set_unmodified(notebook);
        }
        notebook.send_tab_state_to_parent_processes();
    }

    static update_for_clear(notebook) {
        this.reset(notebook, true);
    }
    static update_for_open(notebook, as_import=false) {
        this.reset(notebook, !as_import);
    }
    static update_for_save(notebook) {
        this.set_unmodified(notebook);
    }

    static get_modified_state() {
        return (this.neutral !== this.current);
    }
    // warning: this.set_modified_state(notebook, this.get_modified_state())
    // does not necessarily restore the original state
    static set_modified_state(notebook, state) {
        if (state) {
            this.neutral = undefined;
        } else {
            this.neutral = this.current;
        }
        notebook.send_tab_state_to_parent_processes();
    }
    static set_modified(notebook) {
        this.set_modified_state(notebook, true);
    }
    static set_unmodified(notebook) {
        this.set_modified_state(notebook, false);
    }

    static can_perform_undo() {
        return (this.current >= 0);
    }

    static perform_undo(notebook) {
        if (this.can_perform_undo()) {
            try {
                this._inhibit_add_change = true;
                const change = this.stack[this.current--];
                if (change.is_ephemeral) {
                    // remove the ephemeral change
                    this.stack.splice(this.current+1, 1);
                }
                change.undo_change();
            } finally {
                // Reset _inhibit_add_change asynchronously so that any
                // CodeMirror change events resulting from the this operation
                // are sent (and inhibited) before.
                setTimeout(() => { this._inhibit_add_change = false });
            }
            notebook.send_tab_state_to_parent_processes();
        }
    }

    static can_perform_redo() {
        return (this.current < this.stack.length-1);
    }

    static perform_redo(notebook) {
        if (this.can_perform_redo()) {
            try {
                this._inhibit_add_change = true;
                const change = this.stack[++this.current];
                change.redo_change();
            } finally {
                // Reset _inhibit_add_change asynchronously so that any
                // CodeMirror change events resulting from the this operation
                // are sent (and inhibited) before.
                setTimeout(() => { this._inhibit_add_change = false });
            }
            notebook.send_tab_state_to_parent_processes();
        }
    }

    // INSTANCE

    // If this change has is_ephemeral, then when their undo method is called,
    // the change is removed from the undo stack after its undo action is
    // performed.
    constructor(notebook, is_ephemeral=false) {
        this.notebook     = notebook;
        this.is_ephemeral = is_ephemeral;  // if ephemeral, then undo removes from stack
        this.timestamp    = Date.now()
    }

    toString() {
        return `[${this.constructor.name} timestamp:${this.timestamp}]`;
    }

    coalesce(change) {
        return null;  // default: unable to coalesce
    }

    undo_change() {
        throw new Error('unimplemented method');
    }

    redo_change() {
        throw new Error('unimplemented method');
    }

    do_change() {  // alias for redo_change()
        this.redo_change();
    }
}

// WARNING!
// These change implementations assume that they are called in the proper order.
// Inconsistent state can result from not doing so.

export class EditChange extends Change {
    constructor(notebook, ie_id, changes) {  // changes: { from, to, text, removed, origin }[]  // (from CodeMirror changes event)
        super(notebook);
        this.ie_id   = ie_id;
        this.changes = changes;
    }

    coalesce(change) {
        const max_latency_ms = 1000;
        if (! (change instanceof EditChange)) {
            return null;
        } else if ((change.timestamp - this.timestamp) > max_latency_ms) {
            return null;
        } else if (!this.changes.every(c => c.origin === '+input') || !change.changes.every(c => c.origin === '+input')) {
            return null;
        } else {
            const coalesced = new EditChange(this.notebook, this.ie_id, [ ...this.changes, ...change.changes ]);
            coalesced.timestamp = this.timestamp;
            return coalesced;
        }
    }

    undo_change() {
        const cm = this.notebook.get_internal_state_for_ie_id(this.ie_id).cm;
        for (let i = this.changes.length; --i >= 0; ) {  // apply in reverse order
            const { from, to, text, removed } = this.changes[i];
            this._apply_one_change(cm, from, text, removed);
        }
    }

    redo_change() {
        this.notebook.set_current_ie(document.getElementById(this.ie_id));
        const cm = this.notebook.get_internal_state_for_ie_id(this.ie_id).cm;
        for (const { from, to, text, removed } of this.changes) {
            this._apply_one_change(cm, from, removed, text);
        }
    }

    _apply_one_change(cm, pos, strings_to_remove, strings_to_add) {
        this.notebook.set_current_ie(document.getElementById(this.ie_id));
        const from = { line: pos.line, ch: pos.ch };
        const to = (strings_to_remove.length <= 1)
              ? {
                  line: pos.line,
                  ch:   pos.ch + (strings_to_remove[strings_to_remove.length - 1] ?? '').length,
              }
              : {
                  line: pos.line + strings_to_remove.length - 1,
                  ch:   strings_to_remove[strings_to_remove.length - 1].length,
              };
        cm.replaceRange(strings_to_add, from, to);
    }
}

export class MoveIEChange extends Change {
    constructor(notebook, old_position, new_position) {
        super(notebook);
        this.old_position = old_position;
        this.new_position = new_position;
    }

    undo_change() {
        this._move(this.new_position, this.old_position);
    }

    redo_change() {
        this._move(this.old_position, this.new_position);
    }

    _move(from, to) {
        if (from !== to) {
            const ie = document.getElementById(this.notebook.nb_state.order[from]);
            this.notebook.set_current_ie(ie);
            const next_ie = (from > to)
                  ? document.getElementById(this.notebook.nb_state.order[to])
                  : ( (to >= (this.notebook.nb_state.order.length - 1))
                      ? null
                      : document.getElementById(this.notebook.nb_state.order[to + 1]) );
            interaction_area.insertBefore(ie, next_ie);  // inserts at end when next_ie === null
            this.notebook.update_nb_state_order();
            this.notebook.current_ie.scrollIntoView(false);
            this.notebook.focus_to_current_ie();
        }
    }
}

export class AddNewIEChange extends Change {
    constructor(notebook, position) {
        super(notebook);
        this.position = position;
        this.ie_id    = globalThis.core.generate_object_id();
        this.ie       = undefined;  // will be set in redo_change() aka do_change()
    }

    undo_change() {
        // assuming redo_change() will have already been called and
        // therefore this.ie will be set
        new DeleteIEChange(this.notebook, this.ie).do_change();  // not added to stack, just using the implementation...
    }

    redo_change() {
        const reference_ie_id = this.notebook.nb_state.order[this.position];  // undefined if this.position >= this.notebook.nb_state.order.length
        const reference_ie    = reference_ie_id ? document.getElementById(reference_ie_id) : undefined;
        // the first time this function is called, this.ie will be undefined
        // and then will be set, and then remain thereafter
        this.ie = this.notebook.add_new_ie(reference_ie, false, this.ie_id, this.ie);  // will append if reference_ie is undefined
        this.notebook.set_current_ie(this.ie);
    }
}

export class DeleteIEChange extends Change {
    constructor(notebook, ie) {
        super(notebook);
        this.ie       = ie;
        this.position = this.notebook.nb_state.order.indexOf(ie.id);
    }

    undo_change() {
        const reference_ie_id = this.notebook.nb_state.order[this.position];
        const reference_ie    = reference_ie_id ? document.getElementById(reference_ie_id) : undefined;
        const ie = this.notebook.add_new_ie(reference_ie, false, undefined, this.ie);
        this.notebook.set_current_ie(ie);
    }

    redo_change() {
        this.notebook.set_current_ie(this.ie);
        let next_ie = this.ie.nextElementSibling;
        if (!next_ie) {
            next_ie = this.ie.previousElementSibling;
        }
        if (next_ie) {
            const id = this.ie.id;
            const order_index = this.notebook.nb_state.order.indexOf(id);
            if (order_index === -1) {
                throw new Error('unexpected: when deleting element, id not found in notebook state!');
            }
            this.notebook.nb_state.order.splice(order_index, 1);
            delete this.notebook.nb_state.elements[id];
            this.notebook.get_internal_state_for_ie_id(this.ie.id).cm.toTextArea();  // remove editor from textarea
            this.notebook.remove_internal_state_for_ie_id(this.ie.id);
            interaction_area.removeChild(this.ie);
            if (this.ie === this.notebook.current_ie) {
                this.notebook.current_ie = undefined;  // prevent attempted access
                this.notebook.set_current_ie(next_ie);
            }
        }
    }
}

export class StateChange extends Change {
    constructor(notebook, old_state, new_state) {  // e.g., state: { auto_hide_inputs }
        super(notebook);
        this.old_state = old_state;
        this.new_state = new_state;
    }

    undo_change() {
        Object.assign(this.notebook.nb_state, this.old_state);
        this.notebook.update_global_view_properties();
        this.notebook.send_tab_state_to_parent_processes();
    }

    redo_change() {
        Object.assign(this.notebook.nb_state, this.new_state);
        this.notebook.update_global_view_properties();
        this.notebook.send_tab_state_to_parent_processes();
    }
}

// This Change extension clears the output of its associated ie
// for both undo and redo.  It does not store/restore old state
// in the interest of conserving memory.  Instead, it simply
// resets the output....
// OutputIEChange changes are ephemeral.
export class OutputIEChange extends Change {
    constructor(notebook, ie_id) {
        super(notebook);
        this.ie_id = ie_id;
    }

    undo_change() {
        this.notebook.reset_output(document.getElementById(this.ie_id));
    }

    redo_change() {
        this.notebook.reset_output(document.getElementById(this.ie_id));
    }
}


// === interface ===

export function add_edit_change(notebook, ie_id, changes) {
    Change.add_change(new EditChange(notebook, ie_id, changes));
}

export function perform_move_ie_change(notebook, old_position, new_position) {
    Change.add_change(new MoveIEChange(notebook, old_position, new_position), true);
}

export function perform_move_up_ie_change(notebook, ie_id) {  // returns true iff move was possible
    const order = notebook.nb_state.order;
    const ie_position = order.indexOf(ie_id);
    if (ie_position <= 0) {
        return false;
    } else {
        perform_move_ie_change(notebook, ie_position, ie_position-1);
        return true;
    }
}

export function perform_move_down_ie_change(notebook, ie_id) {  // returns true iff move was possible
    const order = notebook.nb_state.order;
    const ie_position = order.indexOf(ie_id);
    if (ie_position >= order.length-1) {
        return false;
    } else {
        perform_move_ie_change(notebook, ie_position, ie_position+1);
        return true;
    }
}

export function perform_add_new_ie_at_position_change(notebook, position) {
    Change.add_change(new AddNewIEChange(notebook, position), true);
}

export function perform_add_new_before_ie_change(notebook, ie_id) {
    const ie_position = notebook.nb_state.order.indexOf(ie_id);
    perform_add_new_ie_at_position_change(notebook, ie_position);
}

export function perform_add_new_after_ie_change(notebook, ie_id) {
    const ie_position = notebook.nb_state.order.indexOf(ie_id);
    perform_add_new_ie_at_position_change(notebook, ie_position+1);
}

export function perform_delete_ie_change(notebook, ie) {
    Change.add_change(new DeleteIEChange(notebook, ie), true);
}

export function perform_state_change(notebook, old_state, new_state) {
    Change.add_change(new StateChange(notebook, old_state, new_state), true);
}

export function add_ie_output_change(notebook, ie_id) {
    Change.add_change(new OutputIEChange(notebook, ie_id));
}

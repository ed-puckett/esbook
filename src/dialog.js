// === STYLESHEET ===

globalThis.core.create_stylesheet_link(document.head, new URL('dialog/dialog.css', import.meta.url));


// === DIALOG BASE CLASS ===

/* GENERAL DIALOG LAYOUT
 *
 * <div id="content">
 *     <div id="ui">
 *         <div id="unique-id-1" class="dialog">
 *             <!-- dialog child elements... -->
 *         </div>
 *
 *         <div id="unique-id-1" class="dialog">
 *             .
 *             .
 *             .
 *         </div>
 *         .
 *         .
 *         .
 *
 *         <div id="dialog_event_blocker"></div>
 *     </div>
 * </div>
 */

const _dialog_element_to_instance_map = new WeakMap();

export class Dialog {
    static blocker_element_id = 'dialog_event_blocker';
    static dialog_css_class   = 'dialog';

    /** run a new instance of this dialog class
     *  @param {string} message to be passed to instance run() method
     *  @param {Object|undefined|null} options to be passed to instance run() method
     *  @return {Promise}
     */
    static run(message, options) { return new this().run(message, options); }

    /** Return the dialog instance associated with an element, if any.
     *  @param {Element} element an HTML element in the DOM
     *  @return {Element|null} null if element is not a dialog or a child
     *          of a dialog, otherwise the associated Dialog instance.
     */
    static instance_from_element(element) {
        return _dialog_element_to_instance_map[element.closest(`.${this.dialog_css_class}`)];
    }

    constructor() {
        this._promise = new globalThis.core.OpenPromise();
        this._promise.promise.finally(() => {
            try {
                this._destroy_dialog_element();
                this._adjust_event_blocker();
            } catch (error) {
                console.warn('ignoring error when finalizing dialog promise', error);
            }
        });
        try {
            this._dialog_element_id = `dialog-${globalThis.core.uuidv4()}`;
            this._create_dialog_element();
            _dialog_element_to_instance_map[this._dialog_element] = this;
        } catch (error) {
            this._cancel(error);
        }
    }

    get promise (){ return this._promise.promise; }

    run(...args) {
        try {
            this._populate_dialog_element(...args);
            // call this._adjust_event_blocker() on the next tick
            // because otherwise the size calculation is wrong
            // the first time....
            setTimeout(() => this._adjust_event_blocker());
        } catch (error) {
            this._cancel(error);
        }
        return this.promise;
    }


    // === INTERNAL METHODS ===

    // To be overridden to provide the content of the dialog.
    // this.dialog_element will have already been set and will be part of the DOM.
    _populate_dialog_element(...args) {
        throw new Error('unimplemented');
    }

    // to be called when dialog is complete
    _complete(result) {
        this._promise.resolve(result);
    }

    // to be called when dialog is canceled
    _cancel(error) {
        this._promise.reject(error ?? new Error('canceled'));
    }

    // expects this._dialog_element_id is already set, sets this._dialog_element
    _create_dialog_element() {
        if (typeof this._dialog_element_id !== 'string') {
            throw new Error('this._dialog_element_id must already be set to a string before calling this method');
        }
        if (typeof this._dialog_element !== 'undefined') {
            throw new Error('this._dialog_element must be undefined when calling this method');
        }
        const content_element = document.getElementById('content') ??
              globalThis.core.create_child_element(document.body, 'div', { id: 'content' });
        if (content_element.tagName !== 'DIV' || content_element.parentElement !== document.body) {
            throw new Error('pre-existing #content element is not a <div> that is a direct child of document.body');
        }
        const ui_element = document.getElementById('ui') ??
              globalThis.core.create_child_element(content_element, 'div', { id: 'ui' }, true);
        if (ui_element.tagName !== 'DIV' || ui_element.parentElement !== content_element) {
            throw new Error('pre-existing #ui element is not a <div> that is a direct child of the #content element');
        }
        const pre_existing_blocker_element = document.getElementById(this.constructor.blocker_element_id);
        const blocker_element = pre_existing_blocker_element ??
              globalThis.core.create_child_element(ui_element, 'div', { id: this.constructor.blocker_element_id });
        if (blocker_element.tagName !== 'DIV' || blocker_element.parentElement !== ui_element) {
            throw new Error(`pre-existing #${this.constructor.blocker_element_id} element is not a <div> that is a direct child of the #ui element`);
        }
        if (document.getElementById(this._dialog_element_id)) {
            throw new Error(`unexpected: dialog with id ${this._dialog_element_id} already exists`);
        }
        const dialog_element = globalThis.core.create_element('div', {
            id:    this._dialog_element_id,
            class: this.constructor.dialog_css_class,
        });
        // dialog elements must occur before blocker_element
        ui_element.insertBefore(dialog_element, blocker_element);
        this._dialog_element = dialog_element;
    }

    _destroy_dialog_element() {
        if (this._dialog_element) {
            _dialog_element_to_instance_map.delete(this._dialog_element);
            this._dialog_element.remove();
        }
        this._dialog_element = undefined;
    }

    _adjust_event_blocker() {
        const blocker_element = document.getElementById(this.constructor.blocker_element_id);
        const dialog_elements = document.querySelectorAll('#content #ui .dialog');
        const last_dialog_element = dialog_elements[dialog_elements.length-1];  // undefined if dialog_elements is empty
        if (last_dialog_element) {
            const last_dialog_rect = last_dialog_element.getBoundingClientRect();
            const top = last_dialog_rect.top + last_dialog_rect.height;
            blocker_element.style.top = `${top}px`;
        }
    }
}

export class AlertDialog extends Dialog {
    _populate_dialog_element(message, options) {
        const {
            accept_button_label = 'Ok',
        } = (options ?? {});
        globalThis.core.create_child_element(this._dialog_element, 'div', {
            class: 'dialog_text',
        }).innerText = message;
        const button_container = globalThis.core.create_child_element(this._dialog_element, 'span');
        const accept_button = globalThis.core.create_child_element(button_container, 'button', {
            class: 'dialog_accept',
        });
        accept_button.innerText = accept_button_label;
        accept_button.onclick = (event) => this._complete();
        this._dialog_element.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                event.preventDefault();
                this._complete();
            } else if (event.key === 'Enter') {
                event.stopPropagation();
                event.preventDefault();
                this._complete();
            }
        }, {
            capture: true,
        });
        setTimeout(() => accept_button.focus());
    }
}

export class ConfirmDialog extends Dialog {
    _populate_dialog_element(message, options) {
        const {
            decline_button_label = 'No',
            accept_button_label  = 'Yes',
        } = (options ?? {});
        globalThis.core.create_child_element(this._dialog_element, 'div', {
            class: 'dialog_text',
        }).innerText = message;
        const button_container = globalThis.core.create_child_element(this._dialog_element, 'span');
        const decline_button = globalThis.core.create_child_element(button_container, 'button', {
            class: 'dialog_decline',
        });
        decline_button.innerText = decline_button_label;
        decline_button.onclick = (event) => this._complete(false);
        const accept_button = globalThis.core.create_child_element(button_container, 'button', {
            class: 'dialog_accept',
        });
        accept_button.innerText = accept_button_label;
        accept_button.onclick = (event) => this._complete(true);
        this._dialog_element.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                event.preventDefault();
                this._complete(false);
            } else if (event.key === 'Enter') {
                event.stopPropagation();
                event.preventDefault();
                this._complete(true);
            }
        }, {
            capture: true,
        });
        setTimeout(() => accept_button.focus());
    }
}


// === UTILITY FUNCTIONS ===

/** create a new HTML control as a child of the given parent with an optional label element
 *  @param {HTMLElement} parent
 *  @param {string} id for control element
 *  @param {Object|undefined|null} options: {
 *             tag?:         string,   // tag name for element; default: 'input'
 *             type?:        string,   // type name for element; default: 'text' (only used if tag === 'input')
 *             label?:       string,   // if !!label, then create a label element
 *             label_after?: boolean,  // if !!label_after, the add label after element, otherwise before
 *             attrs?:       object,   // attributes to set on the new control element
 *         }
 *  @return {Element} the new control element
 */
export function create_control_element(parent, id, options) {
    if (typeof id !== 'string' || id === '') {
        throw new Error('id must be a non-empty string');
    }
    const {
        tag  = 'input',
        type = 'text',
        label,
        label_after,
        attrs = {},
    } = (options ?? {});

    if ('id' in attrs || 'type' in attrs) {
        throw new Error('attrs must not contain "id" or "type"');
    }
    const control_opts = {
        id,
        ...attrs,
    };
    if (tag === 'input') {
        control_opts.type = type;
    }
    const control = core.create_element(tag, control_opts);
    let control_label;
    if (label) {
        control_label = core.create_element('label', {
            for: id,
        });
        control_label.innerText = label;
    }

    if (label_after) {
        parent.appendChild(control);
        parent.appendChild(control_label);
    } else {
        parent.appendChild(control_label);
        parent.appendChild(control);
    }

    return control;
}

/** create a new HTML <select> and associated <option> elements
 *  as a child of the given parent with an optional label element
 *  @param {HTMLElement} parent
 *  @param {string} id for control element
 *  @param {Object|undefined|null} opts: {
 *             tag?:         string,    // tag name for element; default: 'input'
 *             label?:       string,    // if !!label, then create a label element
 *             label_after?: boolean,   // if !!label_after, the add label after element, otherwise before
 *             attrs?:       object,    // attributes to set on the new <select> element
 *             options?:     object[],  // array of objects, each of which contain "value" and "label" keys (value defaults to label)
 *                                      // values are the option attributes.  If no "value"
 *                                      // attribute is specified then the key is used.
 *         }
 * Note: we are assuming that opts.options is specified with an key-order-preserving object.
 *  @return {Element} the new <select> element
 */
export function create_select_element(parent, id, opts) {
    opts = opts ?? {};
    if ('tag' in opts || 'type' in opts) {
        throw new Error('opts must not contain "tag" or "type"');
    }
    const option_elements = [];
    if (opts.options) {
        for (const { value, label } of opts.options) {
            const option_attrs = { value: (value ?? label) };
            const option_element = globalThis.core.create_element('option', option_attrs);
            option_element.innerText = label;
            option_elements.push(option_element);
        }
    }
    const select_opts = {
        ...opts,
        tag: 'select',
    };
    const select_element = create_control_element(parent, id, select_opts);
    for (const option_element of option_elements) {
        select_element.appendChild(option_element);
    }
    return select_element;
}

export function get_obj_path(obj, path) {
    for (const segment of path) {
        obj = (obj ?? {})[segment];
    }
    return obj;
}

export function set_obj_path(obj, path, value) {
    if (path.length < 1) {
        throw new Error('path must contain at least one segment');
    }
    for (const segment of path.slice(0, -1)) {
        if (typeof obj[segment] === 'undefined') {
            obj[segment] = {};
        }
        obj = obj[segment];
    }
    obj[path.slice(-1)[0]] = value;
}

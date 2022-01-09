'use strict';

(async ({ current_script, facet, facet_export, facet_load_error }) => { try {  // facet begin

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

    class Dialog {
        static blocker_element_id = 'dialog_event_blocker';

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
            } catch (error) {
                this._cancel(error);
            }
        }

        run(...args) {
            try {
                this._populate_dialog_element(...args);
                this._adjust_event_blocker();
            } catch (error) {
                this._cancel(error);
            }
            return this.promise;
        }

        get promise (){ return this._promise.promise; }

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
                class: 'dialog',
            });
            // dialog elements must occur before blocker_element
            ui_element.insertBefore(dialog_element, blocker_element);
            this._dialog_element = dialog_element;
        }

        _destroy_dialog_element() {
            this._dialog_element?.remove();
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

    class AlertDialog extends Dialog {
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

    class ConfirmDialog extends Dialog {
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


    // === STYLESHEET ===

    globalThis.core.create_stylesheet_link(document.head, new URL('dialog/dialog.css', current_script.src));


    // === EXPORT ===

    facet_export({
        Dialog,
        AlertDialog,
        ConfirmDialog,
    });

} catch (err) { facet_load_error(err, current_script); } })(globalThis.core.facet_init());  // facet end

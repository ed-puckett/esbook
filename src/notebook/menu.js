const {
    define_subscribable,
} = await import('../subscribable.js');

const {
    generate_object_id,
} = await import('../uuid.js');

const {
    create_element,
    create_child_element,
} = await import('../dom-util.js');

const {
    get_command_bindings,
} = await import('./key-bindings.js');

const {
    key_spec_to_glyphs,
} = await import('./key-spec.js');


// === INITIAL MENUBAR SPECIFICATION ===

const default_menubar_spec = [
    { label: 'File', collection: [
        { label: 'Clear',         item: { command: 'clear_notebook',       } },
        '---',
        { label: 'Open...',       item: { command: 'open_notebook',        } },
        { label: 'Import...',     item: { command: 'import_notebook',      } },
        { label: 'Reopen',        item: { command: 'reopen_notebook',      } },
        '---',
        { label: 'Save',          item: { command: 'save_notebook',        }, id: 'save' },
        { label: 'Save as...',    item: { command: 'save_as_notebook',     } },
        { label: 'Export...',     item: { command: 'export_notebook',      } },
        '---',
        { label: 'Recent notebooks', id: 'recents', collection: [
            // ...
        ] },
        '---',
        { label: 'Settings...',   item: { command: 'settings',             } },
    ] },

    { label: 'Edit', collection: [
        { label: 'Undo',          item: { command: 'undo',                 }, id: 'undo' },
        { label: 'Redo',          item: { command: 'redo',                 }, id: 'redo' },
    ] },

    { label: 'Element', collection: [
        { label: 'Eval',          item: { command: 'eval_element',         } },
        { label: 'Eval and stay', item: { command: 'eval_stay_element',    } },
        { label: 'Eval before',   item: { command: 'eval_notebook_before', } },
        { label: 'Eval notebook', item: { command: 'eval_notebook',        } },
        '---',
        { label: 'Focus up',      item: { command: 'focus_up_element',     }, id: 'focus_up_element' },
        { label: 'Focus down',    item: { command: 'focus_down_element',   }, id: 'focus_down_element' },
        '---',
        { label: 'Move up',       item: { command: 'move_up_element',      }, id: 'move_up_element' },
        { label: 'Move down',     item: { command: 'move_down_element',    }, id: 'move_down_element' },
        { label: 'Add before',    item: { command: 'add_before_element',   } },
        { label: 'Add after',     item: { command: 'add_after_element',    } },
        { label: 'Delete',        item: { command: 'delete_element',       } },
    ] },

    { label: 'Help', collection: [
        { label: 'Help...',       item: { command: 'help',                 } },
    ] },
];


// === SUBSCRIBABLE/EVENT ===

export class MenuCommandEvent extends define_subscribable('menu-command') {
    get command (){ return this.data; }
}


// === MENUBAR CLASS ===

// css classification classes: menubar, menu, menuitem
// other css classes: disabled, selected, active
// also: menuitem-label, menuitem-separator, menuitem-annotation, collection, collection-arrow

export class MenuBar {

    static menu_element_tag_name     = 'ul';
    static menuitem_element_tag_name = 'li';

    static find_previous_menuitem(menuitem) {
        let mi = menuitem.previousElementSibling;
        while (mi && (!mi.classList.contains('menuitem') || mi.classList.contains('disabled'))) {
            mi = mi.previousElementSibling;
        }
        return mi;
    }

    static find_next_menuitem(menuitem) {
        let mi = menuitem.nextElementSibling;
        while (mi && (!mi.classList.contains('menuitem') || mi.classList.contains('disabled'))) {
            mi = mi.nextElementSibling;
        }
        return mi;
    }

    constructor(parent, menubar_spec=default_menubar_spec) {
        if (! (parent instanceof Element)) {
            throw new Error('parent must be an instance of Element');
        }

        this._menu_id_to_element = {};

        this._menubar_container = this._build_menubar(parent, menubar_spec);
    }

    activate() {
        if (!(this._menubar_container instanceof Element) || !this._menubar_container.classList.contains('menubar')) {
            throw new Error('this._menubar_container must be an Element with class "menubar"');
        }
        if (!this._menubar_container.querySelector('.selected')) {
            // select the first menuitem of the menubar
            const menubar_first_menuitem = this._menubar_container.querySelector('.menuitem');
            if (menubar_first_menuitem) {
                this._select_menuitem(menubar_first_menuitem);
            }
        }
        setTimeout(() => this._menubar_container.focus());
    }

    deactivate() {
        this._deactivate_menu(this._menubar_container);
    }

    // create the set_menu_enabled_state() utility function
    set_menu_enabled_state(menu_id, new_enabled_state) {
        const element = this._menu_id_to_element[menu_id];
        if (!element) {
            throw new Error(`no element found for menu id "${menu_id}"`);
        }
        if (!element.classList.contains('menuitem')) {
            throw new Error(`element for menu id "${menu_id}" is not a menuitem`);
        }
        if (new_enabled_state) {
            element.classList.remove('disabled');
        } else {
            element.classList.add('disabled');
        }
    }

    // === INTERNAL ===

    /** deactivate the menubar or menu that contains the given menuitem
     *  and reset all subordinate state.
     *  @param {Element|undefined|null} menu_element an Element object with class either .menubar or .menu
     *  This is compatible with menuitem elements that are contained
     *  in either a .menubar or .menu element.
     */
    _deactivate_menu(menu_element) {
        if (menu_element) {
            if ( !(menu_element instanceof Element) ||
                 (!menu_element.classList.contains('menubar') && !menu_element.classList.contains('menu')) ) {
                throw new Error('menu_element must be an Element with class "menubar" or "menu"');
            }
            menu_element.classList.remove('active');
            menu_element.classList.remove('selected');
            for (const mi of menu_element.children) {
                mi.classList.remove('selected');
                if (mi.classList.contains('collection')) {
                    this._deactivate_menu(mi.querySelector('.menu'));
                }
            }
        }
    }

    /** deselect the given menuitem
     *  @param {Element} menuitem_element
     *  This is compatible with menuitem elements that are contained
     *  in either a .menubar or .menu element.
     */
    _deselect_menuitem(menuitem_element) {
        menuitem_element.classList.remove('selected');
        if (menuitem_element.classList.contains('collection')) {
            this._deactivate_menu(menuitem_element.querySelector('.menu'));
        }
    }

    /** select the given menuitem and deselect all others
     *  @param {Element} menuitem_element
     *  This is compatible with menuitem elements that are contained
     *  in either a .menubar or .menu element.
     */
    _select_menuitem(menuitem_element) {
        if (!menuitem_element.classList.contains('selected')) {
            // change selection only if not already selected
            for (const mi of menuitem_element.closest('.menubar, .menu').children) {
                if (mi === menuitem_element) {
                    mi.classList.add('selected');
                    if (mi.classList.contains('collection')) {
                        // make it "active" so that the submenu is displayed
                        mi.querySelector('.menu').classList.add('active');
                        // adjust the position of the collection
                        const collection = mi.querySelector('.menu');
                        const mi_br = mi.getBoundingClientRect();
                        if (mi.parentElement.classList.contains('menubar')) {
                            collection.style.top  = `${mi_br.y + mi_br.height}px`;
                            collection.style.left = `${mi_br.x}px`;
                        } else {
                            collection.style.top  = `${mi_br.y - mi_br.height - 7}px`;  // kludge: subtract extra to account for menu padding
                            collection.style.left = `${mi_br.x + mi_br.width}px`;
                        }
                    }
                } else {
                    this._deselect_menuitem(mi);
                }
            }
        }
    }


    /** Return a new menu Element object which represents a separator.
     *  @param {Element} parent
     */
    _build_menu_item_separator(parent) {
        if (! (parent instanceof Element)) {
            throw new Error('parent must be an instance of Element');
        }
        const element = create_child_element(parent, this.constructor.menuitem_element_tag_name, {
            class: 'disabled menuitem menuitem-separator',
        });
    }

    /** Return a new menu Element object for the given menu_spec.
     *  @param {object|string} menu_spec specification for menu item or collection.
     *         If a string, then create a separator (regardless of the string contents).
     *  @param {Element} parent
     *  @param {boolean} (optional) toplevel if the menu is the top-level "menubar" menu
     *         default value: false
     *  @return {Element} new menu Element
     *  Also updates _menu_id_to_object_id and _object_id_to_menu_id.
     */
    _build_menu(menu_spec, parent, toplevel=false) {
        if (! (parent instanceof Element)) {
            throw new Error('parent must be an instance of Element');
        }
        if (typeof menu_spec === 'string') {
            return this._build_menu_item_separator(parent);
        }

        const {
            label,
            collection,
            item,
            id: menu_id,
        } = menu_spec;

        if (typeof label !== 'string') {
            throw new Error('label must be specified as a string');
        }
        if (item && collection) {
            throw new Error('item and collection must not both be specified');
        }
        if (collection) {
            if (!Array.isArray(collection)) {
                throw new Error('collection must be an array');
            }
        }
        if (item) {
            if (typeof item !== 'object' || typeof item.command !== 'string') {
                throw new Error('item must specify an object with a string property "command"');
            }
        }
        if (!['undefined', 'string'].includes(typeof menu_id) || menu_id === '') {
            throw new Error('id must be a non-empty string');
        }

        const id = generate_object_id();

        // both items and collections are a menuitem, but the
        // collection also has children...
        const element = create_element(this.constructor.menuitem_element_tag_name, {
            id,
            class: 'menuitem',
        });
        // add the label
        create_child_element(element, 'div', {
            class: 'menuitem-label',
        }).innerText = label;

        element.addEventListener('mousemove', (event) => {
            // don't pop open top-level menus unless one is already selected
            // this means that the user must click the top-level menu to get things started
            if (!toplevel || [ ...parent.children ].some(c => c.classList.contains('selected'))) {
                if (!element.classList.contains('disabled')) {
                    this._select_menuitem(element);
                }
            }
        });

        if (collection) {

            element.classList.add('collection');

            const collection_element = create_child_element(element, this.constructor.menu_element_tag_name, {
                class: 'menu',
            });
            if (!toplevel) {
                create_child_element(element, 'div', {
                    class: 'menuitem-annotation collection-arrow',
                }).innerText = '\u25b8';  // right-pointing triangle
            }
            collection.forEach(spec => this._build_menu(spec, collection_element));

            if (toplevel) {
                element.addEventListener('click', (event) => {
                    if (event.target.closest('.menuitem') === element) {  // make sure click is not in a child (submenu)
                        if (element.classList.contains('selected')) {
                            this._deselect_menuitem(element);
                        } else {
                            this._select_menuitem(element);
                        }
                        event.stopPropagation();
                        event.preventDefault();
                    }
                });
            }

        } else {  // item

            const command_bindings = get_command_bindings();
            const kbd_bindings = command_bindings[item.command];
            if (kbd_bindings) {
                const kbd_container = create_child_element(element, 'div', {
                    class: 'menuitem-annotation',
                });
                // create <kbd>...</kbd> elements
                kbd_bindings.forEach(binding => {
                    const binding_glyphs = key_spec_to_glyphs(binding);
                    create_child_element(kbd_container, 'kbd').innerText = binding_glyphs;
                });
            }
            element.addEventListener('click', (event) => {
                this._deactivate_menu(element.closest('.menubar'));
                MenuCommandEvent.dispatch_event(item.command);
                event.stopPropagation();
                event.preventDefault();
            });

        }

        if (menu_id) {
            this._menu_id_to_element[menu_id] = element;
        }

        // wait to add to parent until everything else happens without error
        if (parent) {
            parent.appendChild(element);
        }

        return element;
    }

    _build_menubar(parent, menubar_spec) {
        const menubar_container = create_child_element(parent, this.constructor.menu_element_tag_name, {
            class:    'active menubar',
            tabindex: 0,
        }, true);
        menubar_spec.forEach(spec => this._build_menu(spec, menubar_container, true));

        // add event listener to close menu when focus is lost
        menubar_container.addEventListener('blur', (event) => {
            this._deactivate_menu(menubar_container);
        });

        // add keyboard navigation event listener
        menubar_container.addEventListener('keydown', (event) => {
            const selected_elements = menubar_container.querySelectorAll('.selected');
            if (selected_elements.length <= 0) {
                if (! ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(event.key)) {
                    return;  // do not handle or alter propagation
                } else {
                    // select the first menuitem of the menubar
                    const menubar_first_menuitem = menubar_container.querySelector('.menuitem');
                    if (menubar_first_menuitem) {
                        this._select_menuitem(menubar_first_menuitem);
                    }
                }
            } else {
                const menuitem = selected_elements[selected_elements.length-1];

                const is_in_menubar = (menuitem.parentElement === menubar_container);

                let key_menu_prev, key_menu_next, key_cross_prev, key_cross_next;
                if (is_in_menubar) {
                    key_menu_prev  = 'ArrowLeft';
                    key_menu_next  = 'ArrowRight';
                    key_cross_prev = 'ArrowUp';
                    key_cross_next = 'ArrowDown';
                } else {
                    key_menu_prev  = 'ArrowUp';
                    key_menu_next  = 'ArrowDown';
                    key_cross_prev = 'ArrowLeft';
                    key_cross_next = 'ArrowRight';
                }

                switch (event.key) {
                case 'Enter':
                case ' ': {
                    menuitem.click();
                    break;
                }
                case 'Escape': {
                    this._deactivate_menu(menubar_container);
                    break;
                }
                case key_menu_prev: {
                    const mi = this.constructor.find_previous_menuitem(menuitem);
                    if (mi) {
                        this._select_menuitem(mi);
                    } else if (!is_in_menubar) {
                        menuitem.classList.remove('selected');  // parent menuitem will still be selected
                    }
                    break;
                }
                case key_menu_next: {
                    const mi = this.constructor.find_next_menuitem(menuitem);
                    if (mi) {
                        this._select_menuitem(mi);
                    }
                    break;
                }
                case key_cross_prev: {
                    if (!is_in_menubar) {
                        const menubar_menuitem = menubar_container.querySelector('.menuitem.selected');
                        const mbi = this.constructor.find_previous_menuitem(menubar_menuitem);
                        if (mbi) {
                            this._select_menuitem(mbi);
                        }
                    }
                    break;
                }
                case key_cross_next: {
                    let navigated_into_collection = false;
                    if (menuitem.classList.contains('collection')) {
                        // enter collection if possible
                        const mi = menuitem.querySelector('.menuitem:not(.disabled)');
                        if (mi) {
                            this._select_menuitem(mi);
                            navigated_into_collection = true;
                        }
                    }
                    if (!navigated_into_collection && !is_in_menubar) {
                        const menubar_menuitem = menubar_container.querySelector('.menuitem.selected');
                        const mbi = this.constructor.find_next_menuitem(menubar_menuitem);
                        if (mbi) {
                            this._select_menuitem(mbi);
                        }
                    }
                    break;
                }

                default:
                    return;  // do not handle or alter propagation
                }
            }

            // if we get here, assume the event was handled and therefore
            // we should stop propagation and prevent default action.
            event.stopPropagation();
            event.preventDefault();
        }, {
            capture: true,
        });

        return menubar_container;
    }
}

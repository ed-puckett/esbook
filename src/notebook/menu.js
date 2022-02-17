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


// === INITIAL MENUBAR SPECIFICATION ===

const initial_menubar_collection = [
    { label: 'File', collection: [
        { label: 'Clear',         item: { command: 'clear_notebook',       } },
        'separator',
        { label: 'Open...',       item: { command: 'open_notebook',        } },
        { label: 'Import...',     item: { command: 'import_notebook',      } },
        { label: 'Reopen',        item: { command: 'reopen_notebook',      } },
        'separator',
        { label: 'Save',          item: { command: 'save_notebook',        }, id: 'save' },
        { label: 'Save as...',    item: { command: 'save_as_notebook',     } },
        { label: 'Export...',     item: { command: 'export_notebook',      } },
        'separator',
        { label: 'Recents', id: 'recents', collection: [
            // ...
        ] },
        'separator',
        { label: 'Settings...',   item: { command: 'settings',             } },
    ] },

    { label: 'Edit', collection: [
        { label: 'Undo',          item: { command: 'undo',                 }, id: 'undo' },
        { label: 'Redo',          item: { command: 'redo',                 }, id: 'redo' },
    ] },

    { label: 'Element', collection: [
        { label: 'Eval',          item: { command: 'eval_element',         } },
        { label: 'Eval and stay', item: { command: 'eval_stay_element',    } },
        { label: 'Eval notebook', item: { command: 'eval_notebook',        } },
        { label: 'Eval before',   item: { command: 'eval_notebook_before', } },
        'separator',
        { label: 'Focus up',      item: { command: 'focus_up_element',     }, id: 'focus_up_element' },
        { label: 'Focus down',    item: { command: 'focus_down_element',   }, id: 'focus_down_element' },
        'separator',
        { label: 'Move up',       item: { command: 'move_up_element',      }, id: 'move_up_element' },
        { label: 'Move down',     item: { command: 'move_down_element',    }, id: 'move_down_element' },
        { label: 'Add before',    item: { command: 'add_before_element',   } },
        { label: 'Add after',     item: { command: 'add_after_element',    } },
        { label: 'Delete',        item: { command: 'delete_element',       }, id: 'delete_element' },
    ] },

    { label: 'Help', collection: [
        { label: 'Help...',       item: { command: 'help',                 } },
    ] },
];


// === MENU BUILD/CREATION ===

// other css classes: disabled, selected, active
// also: menuitem-annotation, collection-arrow

const menu_element_tag_name     = 'ul';
const menuitem_element_tag_name = 'li';

const menubar_css_class = 'menubar';
const menubar_role      = 'menubar';

const menu_css_class = 'menu';
const menu_role      = 'menu';

const menuitem_css_class = 'menuitem';
const menuitem_role      = 'menuitem';

const menuitem_separator_css_class = 'separator';


/** Return a new menu Element object which represents a separator.
 *  @param {Element} parent
 */
function build_separator_menu_item(parent) {
    if (parent) {
        if (! (parent instanceof Element)) {
            throw new Error('parent must be an instance of Element');
        }
    }
    const element = create_child_element(parent, menuitem_element_tag_name, {
        class: `disabled ${menuitem_css_class} ${menuitem_separator_css_class}`,
        role:  menuitem_role,
    });
}

let _menu_id_to_object_id = {};
let _object_id_to_menu_id = {};

/** Return a new menu Element object for the given menu_spec.
 *  @param {object|string} menu_spec specification for menu item or collection.
 *                         If a string, then create a separator.
 *  @param {Element} parent
 *  @return {Element} new menu Element
 *  Also updates _menu_id_to_object_id and _object_id_to_menu_id.
 */
function build_menu(menu_spec, parent=null, toplevel=false) {
    if (parent) {
        if (! (parent instanceof Element)) {
            throw new Error('parent must be an instance of Element');
        }
    }
    if (typeof menu_spec === 'string') {
        return build_separator_menu_item(parent);
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
    let prior_menu_id_to_object_id_value;
    let prior_object_id_to_menu_id_value;
    if (menu_id) {
        // save these in case of error
        prior_menu_id_to_object_id_value = _menu_id_to_object_id[menu_id];
        prior_object_id_to_menu_id_value = _object_id_to_menu_id[id];

        _menu_id_to_object_id[menu_id] = id;
        _object_id_to_menu_id[id] = menu_id;
    }

    try {

        // both items and collections are a menuitem, but the
        // collection also has children...
        const element = create_element(menuitem_element_tag_name, {
            id,
            class: `${menuitem_css_class}`,
            role:  menuitem_role,
        });

        const label_element = create_child_element(element, 'span');
        label_element.innerText = label;

        if (collection) {

            const collection_element = create_child_element(element, menu_element_tag_name, {
                class: `${menu_css_class}`,
                role:  menu_role,
            });
            if (!toplevel) {
                create_child_element(element, 'div', {
                    class: 'menuitem-annotation collection-arrow',
                }).innerText = '>';  // arrow
            }
            collection.forEach(spec => build_menu(spec, collection_element));
            //!!! event handler (mouse, keyboard)

        } else {  // item

            const command_bindings = get_command_bindings();
            const kbd_bindings = command_bindings[item.command];
            if (kbd_bindings) {
                const kbd_container = create_child_element(element, 'div', {
                    class: 'menuitem-annotation',
                });
                // create <kbd>...</kbd> elements
                kbd_bindings.forEach(binding => {
                    create_child_element(kbd_container, 'kbd').innerText = binding;
                });
            }
            //!!! event handler (mouse, keyboard; using command)

        }

        // wait to add to parent until everything else happens without error
        if (parent) {
            parent.appendChild(element);
        }
        return element;

    } catch (error) {
        if (menu_id) {
            _menu_id_to_object_id[menu_id] = prior_menu_id_to_object_id_value;
            _object_id_to_menu_id[id]      = prior_object_id_to_menu_id_value;
        }
        throw error;
    }
}

export function build_menubar(parent) {
    if (! (parent instanceof Element)) {
        throw new Error('parent must be an instance of Element');
    }

    // reset id mappings
    _menu_id_to_object_id = {};
    _object_id_to_menu_id = {};

    const menubar_container = create_child_element(parent, menu_element_tag_name, {
        class: `active ${menubar_css_class}`,
        role:  menubar_role,
    }, true);

    initial_menubar_collection.forEach(spec => build_menu(spec, menubar_container, true));

    return menubar_container;
}

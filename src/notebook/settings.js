const { define_subscribable } = await import('../subscribable.js');

const {
    db_key_settings,
    storage_db,
} = await import('./storage.js');


// === INITIAL SETTINGS ===

export const initial_settings = {
    editor_options: {
        indentUnit:     2,
        tabSize:        4,
        indentWithTabs: false,
        keyMap:         'default',
    },
    formatting_options: {
        align:  'left',
        indent: '0em',
    },
    theme_colors: 'system',
};

export function deep_freeze(object) {
    for (const [ key, value ] of Object.entries(object)) {
        if (typeof value === 'object' || Array.isArray(value)) {
            deep_freeze(object[key]);
        }
    }
    return Object.freeze(object);
}

deep_freeze(initial_settings);


// === EVENT INTERFACE ===

function copy_settings(settings) {
    return JSON.parse(JSON.stringify(settings));
}

export class SettingsUpdatedEvent extends define_subscribable('settings-updated') {
    get_settings() {
        // return a copy to insulate receivers from each others' modifications
        return copy_settings(this.data);
    }
}


// === GENERIC VALIDATION ===

const numeric_re = /^([+-]?[0-9]+[.][0-9]*[Ee][+-]?[0-9]+|[+-]?[.][0-9]+[Ee][+-]?[0-9]+|[+-]?[0-9]+[Ee][+-]?[0-9]+|[+-]?[0-9]+[.][0-9]*|[+-]?[.][0-9]+|[+-]?[0-9]+)$/;

/** validate test_value for being numeric
 *  @param {string|number} test_value string (or number) to be tested 
 *  @param {Object|undefined} options an object that may contain values for any of the following flags:
 *             require_integer
 *             reject_negative
 *             reject_zero
 *             reject_positive
 *  @return {boolean} result of validation
 */
export function validate_numeric(test_value, options) {
    const {
        require_integer,
        reject_negative,
        reject_zero,
        reject_positive,
    } = (options ?? {})

    let numeric_value;
    if (typeof test_value === 'number') {
        numeric_value = test_value;
    } else {
        if (typeof test_value !== 'string') {
            return false;
        }
        if (!test_value.trim().match(numeric_re)) {
            return false;
        }
        numeric_value = Number.parseFloat(test_value);
    }

    if ( isNaN(numeric_value)                                  ||
         (require_integer && !Number.isInteger(numeric_value)) ||
         (reject_positive && numeric_value >   0)              ||
         (reject_zero     && numeric_value === 0)              ||
         (reject_negative && numeric_value <   0)                 ) {
        return false;
    }
    return true;
}

/** check if test_value is in a collection of objects
 *  @param {any} test_value value to be tested if it is in collection
 *  @param {Array} collection objects to test membership in
 *  @param {string} name (Optional) name to use for test_value
 *  @return {string|undefined} complaint string if not in collection, or undefined if it is.
 */
export function analyze_contained(test_value, collection, name) {
    if (! collection.includes(test_value)) {
        return `${name ?? 'value'} must be one of: ${collection.map(o => (typeof o === 'string') ? `"${o}"` : o.toString()).join(', ')}`;
    }
    return undefined;
}


// === SETTINGS VALIDATION ===

export function analyze_editor_options_indentUnit(value, name) {
    if (!validate_numeric(value, { require_integer: true, reject_negative: true })) {
        return `${name ?? 'indentUnit'} must be a non-negative integer`;
    }
    return undefined;
}
export function analyze_editor_options_tabSize(value, name) {
    if (!validate_numeric(value, { require_integer: true, reject_negative: true })) {
        return `${name ?? 'tabSize'} must be a non-negative integer`;
    }
    return undefined;
}
export function analyze_editor_options_indentWithTabs(value, name) {
    if (typeof value !== 'boolean') {
        return `${name ?? 'indentWithTabs'} must be a boolean value`;
    }
    return undefined;
}
export function analyze_editor_options_keyMap(value, name) {
    const valid = ['default', 'emacs', 'sublime', 'vim'];
    return analyze_contained(value, valid, (name ?? 'keyMap'));
}

export function analyze_editor_options(editor_options, name) {
    if (typeof editor_options !== 'object') {
        return `${name ?? 'editor_options'} must be an object`;
    }
    const keys = Object.keys(editor_options);
    if (!keys.every(k => ['indentUnit', 'tabSize', 'indentWithTabs', 'keyMap'].includes(k))) {
        return `${name ?? 'editor_options'} may only have the keys "indentUnit", "tabSize", "indentWithTabs" and "keyMap"`;
    }
    if ('indentUnit' in editor_options) {
        const complaint = analyze_editor_options_indentUnit(editor_options.indentUnit);
        if (complaint) {
            return complaint;
        }
    }
    if ('tabSize' in editor_options) {
        const complaint = analyze_editor_options_tabSize(editor_options.tabSize);
        if (complaint) {
            return complaint;
        }
    }
    if ('indentWithTabs' in editor_options) {
        const complaint = analyze_editor_options_indentWithTabs(editor_options.indentWithTabs);
        if (complaint) {
            return complaint;
        }
    }
    if ('keyMap' in editor_options) {
        const complaint = analyze_editor_options_keyMap(editor_options.keyMap);
        if (complaint) {
            return complaint;
        }
    }
    return undefined;
}

/** analyze/validate a formatting_options align property
 *  @param {string} value
 *  @return {string|undefined} returns a complaint string if invalid, or undefined if valid
 */
export function analyze_formatting_options_align(value, name) {
    const valid_alignments = ['left', 'center', 'right'];
    return analyze_contained(value, valid_alignments, (name ?? 'align'));
}
/** analyze/validate a formatting_options indent property
 *  @param {string} value
 *  @return {string|undefined} returns a complaint string if invalid, or undefined if valid
 */
export function analyze_formatting_options_indent(value, name) {
    const valid_units = ['pt', 'pc', 'in', 'cm', 'mm', 'em', 'ex', 'mu'];
    if (!valid_units.every(s => (s.length === 2))) {
        throw new Error('unexpected: valid units contains a string whose length is not 2');
    }
    const complaint = `${name ?? 'indent'} must be a string containing a non-negative number followed by one of: "${valid_units.join('", "')}"`;
    if (typeof value !== 'string') {
        return complaint;
    }
    // all valid units strings are length 2
    value = value.trim();
    const amount_str = value.slice(0, -2);
    const units      = value.slice(-2);
    if ( !validate_numeric(amount_str, { reject_negative: true }) ||
         !valid_units.includes(units) ) {
        return complaint;
    }
    return undefined;
}
/** analyze/validate a formatting_options object
 *  @param {Object} formatting_options: { align?: string, indent?: string }
 *  @return {string|undefined} returns a complaint string if invalid, or undefined if valid
 */
export function analyze_formatting_options(formatting_options, name) {
    if (typeof formatting_options !== 'object') {
        return `${name ?? 'formatting_options'} must be an object`;
    }
    const keys = Object.keys(formatting_options);
    if (!keys.every(k => ['align', 'indent'].includes(k))) {
        return `${name ?? 'formatting_options'} may only have the keys "align" and "indent"`;
    }
    if ('align' in formatting_options) {
        const complaint = analyze_formatting_options_align(formatting_options.align);
        if (complaint) {
            return complaint;
        }
    }
    if ('indent' in formatting_options) {
        const complaint = analyze_formatting_options_indent(formatting_options.indent);
        if (complaint) {
            return complaint;
        }
    }
    return undefined;
}

export function analyze_theme_colors(value, name) {
    const valid = ['system', 'dark', 'light'];
    return analyze_contained(value, valid, (name ?? 'theme_colors'));
}

export function analyze_settings(settings, name) {
    if (typeof settings !== 'object') {
        return `${name ?? 'settings'} must be an object`;
    }
    const keys = Object.keys(settings);
    if (!keys.every(k => ['editor_options', 'formatting_options', 'theme_colors'].includes(k))) {
        return `${name ?? 'settings'} may only have the keys "editor_options", "formatting_options" and "theme_colors"`;
    }
    if ('editor_options' in settings) {
        const complaint = analyze_editor_options(settings.editor_options);
        if (complaint) {
            return complaint;
        }
    }
    if ('formatting_options' in settings) {
        const complaint = analyze_formatting_options(settings.formatting_options);
        if (complaint) {
            return complaint;
        }
    }
    if ('theme_colors' in settings) {
        const complaint = analyze_theme_colors(settings.theme_colors);
        if (complaint) {
            return complaint;
        }
    }
    return undefined;
}

// validate initial_settings
(() => {
    const complaint = analyze_settings(initial_settings);
    if (complaint) {
        throw new Error(`initial_settings: ${complaint}`);
    }
})();


// === STORAGE ===

// may throw an error if the settings value is corrupt or circular
async function put_settings_to_storage(settings) {
    return storage_db.put(db_key_settings, settings);
}

// may throw an error if settings value corrupt and unable to store initial settings
async function get_settings_from_storage() {
    try {
        const settings = await storage_db.get(db_key_settings);
        if (!analyze_settings(settings)) {
            return settings;
        }
        // otherwise, if !settings, fall out to reset...
    } catch (_) {
        // if error, fall out to reset...
    }
    // Either settings_string was null or an error occurred when parsing, so reset
    await put_settings_to_storage(initial_settings);
    return initial_settings;
}

let current_settings = await get_settings_from_storage();
export async function _reset_settings() {
    return update_settings(initial_settings);
}
export function get_settings() {
    // return a copy to insulate receivers from each other's modifications
    return copy_settings(current_settings);
}

// may throw an error if the new_settings value is corrupt or circular
export async function update_settings(new_settings) {
    const complaint = analyze_settings(new_settings);
    if (complaint) {
        throw new Error(complaint);
    }
    await put_settings_to_storage(new_settings);  // may throw an error
    current_settings = new_settings;
    SettingsUpdatedEvent.dispatch_event(new_settings);
}

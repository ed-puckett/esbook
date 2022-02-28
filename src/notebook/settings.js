const { define_subscribable } = await import('../subscribable.js');

const {
    db_key_settings,
    storage_db,
} = await import('./storage.js');


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


// === STORAGE ===

const initial_settings = {
    editor_options: {
        indentUnit:     2,
        tabSize:        4,
        indentWithTabs: false,
        keyMap:         'default',
    },
    tex_options: {
        displayIndent: '0em',
        displayAlign:  'left',
    },
    theme_colors: 'system',
};

// may throw an error if the settings value is corrupt or circular
async function put_settings_to_storage(settings) {
    return storage_db.put(db_key_settings, settings);
}

// may throw an error if settings value corrupt and unable to store initial settings
async function get_settings_from_storage() {
    try {
        const settings = await storage_db.get(db_key_settings);
        if (settings) {
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
    // return a copy to insulate receivers from each others' modifications
    return copy_settings(current_settings);
}

// may throw an error if the new_settings value is corrupt or circular
export async function update_settings(new_settings) {
    await put_settings_to_storage(new_settings);  // may throw an error
    current_settings = new_settings;
    SettingsUpdatedEvent.dispatch_event(new_settings);
}

'use strict';

(async ({ current_script, facet_export, facet_load_error }) => { try {  // facet begin

    const define_subscribable = await facet('facet/subscribable.js');


    // === EVENT INTERFACE ===

    function copy_settings(settings) {
        return JSON.parse(JSON.stringify(settings));
    }

    class SettingsUpdatedEvent extends define_subscribable('settings-updated') {
        get_settings() {
            // return a copy to insulate receivers from each others' modifications
            return copy_settings(this.data);
        }
    }


    // === STORAGE ===

    // settings_storage_key uses a UUID, but this must be constant,
    // not generated each time the system is loaded.
    const settings_storage_key = 'settings-87a4c2ee-a607-45f9-b648-935ecfc0c059';

    const initial_settings = {
        editor_options: {
            indentUnit:     2,
            tabSize:        4,
            indentWithTabs: false,
            keyMap:         'default',
        },
    };

    // may throw an error if the settings value is corrupt or circular
    function put_settings_to_storage(settings) {
        localStorage.setItem(settings_storage_key, JSON.stringify(settings));
    }

    // may throw an error if settings value corrupt and unable to store initial settings
    function get_settings_from_storage() {
        try {
            const settings_string = localStorage.getItem(settings_storage_key);
            if (settings_string) {
                return JSON.parse(settings_string);
            }
        } catch (_) {
            // fall out to reset...
        }
        // Either settings_string was null or an error occurred when parsing, so reset
        put_settings_to_storage(initial_settings);
        return initial_settings;
    }

    let current_settings = get_settings_from_storage();
    function _reset_settings() {
        update_settings(initial_settings);
    }
    function get_settings() {
        // return a copy to insulate receivers from each others' modifications
        return copy_settings(current_settings);
    }

    // may throw an error if the new_settings value is corrupt or circular
    function update_settings(new_settings) {
        put_settings_to_storage(new_settings);  // may throw an error
        current_settings = new_settings;
        SettingsUpdatedEvent.dispatch_event(new_settings);
    }


    // === EXPORT ===

    facet_export({
        SettingsUpdatedEvent,
        _reset_settings,
        get_settings,
        update_settings,
    });

} catch (err) { facet_load_error(err, current_script); } })(facet_init());  // facet end

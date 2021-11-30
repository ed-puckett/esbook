'use strict';

// This is a facet

(() => {
    try {

        const settings_storage_key = 'settings-87a4c2ee-a607-45f9-b648-935ecfc0c059';

        const initial_settings = {
            editor_options: {
                indentUnit:     2,
                tabSize:        4,
                indentWithTabs: false,
                keyMap:         'default',
            },
        };

        function copy_settings(settings) {
            return JSON.parse(JSON.stringify(settings));
        }

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

        const settings_changed_event_target = document;
        const settings_changed_event_type   = `settings-changed-${uuidv4()}`;

        class SettingsUpdatedEvent extends Event {
            static dispatch_event(new_settings) {
                settings_changed_event_target.dispatchEvent(new this(new_settings));
            }

            constructor(settings) {
                super(settings_changed_event_type);
                this._settings = settings;
            }

            get_settings() {
                // return a copy to insulate receivers from each others' modifications
                return copy_settings(this._settings);
            }
        };

        const event_handler_functions = {};
        // returns a subscription_key that can be used to unsubscribe
        function subscribe_settings_update(handler_function) {
            if (typeof handler_function !== 'function') {
                throw new Error('handler_function must be a function');
            }
            const subscription_key = `subscribe-settings-${uuidv4()}`;
            event_handler_functions[subscription_key] = handler_function;
            settings_changed_event_target.addEventListener(settings_changed_event_type, handler_function);
            return subscription_key;
        }
        function unsubscribe_settings_update(subscription_key) {
            const handler_function = event_handler_functions[subscription_key];
            if (!handler_function) {
                throw new Error('invalid subscription_key');
            }
            delete event_handler_functions[subscription_key];
            settings_changed_event_target.removeEventListener(settings_changed_event_type, handler_function);
        }

        // may throw an error if the new_settings value is corrupt or circular
        function update_settings(new_settings) {
            put_settings_to_storage(new_settings);  // may throw an error
            current_settings = new_settings;
            SettingsUpdatedEvent.dispatch_event(new_settings);
        }
        
        facet_export({
            _reset_settings,
            get_settings,
            update_settings,
            subscribe_settings_update,
            unsubscribe_settings_update,
            settings_changed_event_target,
            settings_changed_event_type,
        });

    } catch (err) {
        facet_load_error(err);
    }
})();
